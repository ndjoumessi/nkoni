import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { statutSelonTally } from '../src/services/vote.service'

/**
 * Votes en ligne (§ vie associative). Prisma mocké. Verrouille les gardes (auth, membre lié résolu
 * par `sub`, permission dirigeant, résolution clôturée) et la dérivation du statut au dépouillement.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}
const authMembre = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1' })}`,
})
const authAdmin = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u9', role: 'ADMIN', organisationId: 'org-1' })}`,
})

describe('statutSelonTally (pur)', () => {
  it('POUR strictement majoritaire → ADOPTEE ; sinon (dont égalité et 0-0) → REJETEE', () => {
    expect(statutSelonTally({ POUR: 3, CONTRE: 1, ABSTENTION: 5, total: 9 })).toBe('ADOPTEE')
    expect(statutSelonTally({ POUR: 2, CONTRE: 2, ABSTENTION: 0, total: 4 })).toBe('REJETEE')
    expect(statutSelonTally({ POUR: 0, CONTRE: 0, ABSTENTION: 0, total: 0 })).toBe('REJETEE')
    // Les abstentions ne comptent pas dans la majorité : 1 POUR > 0 CONTRE → ADOPTEE.
    expect(statutSelonTally({ POUR: 1, CONTRE: 0, ABSTENTION: 10, total: 11 })).toBe('ADOPTEE')
  })
})

describe('PUT /moi/resolutions/:id/vote (membre self-service)', () => {
  it('sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('compte sans fiche membre → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('résolution inexistante → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      membre: { findFirst: async () => ({ id: 'm1' }) },
      resolution: { findFirst: async () => null },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('happy path : upsert sur (résolution, membre) résolu par le sub, renvoie le sens', async () => {
    let whereRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      // Deux lectures distinctes : la ROUTE résout le membre par `compteUtilisateurId` (self-service),
      // le SERVICE le revérifie par `id` (garde d'appartenance à l'org). Le mock modélise les deux.
      membre: {
        findFirst: async ({ where }: any) =>
          where.compteUtilisateurId === 'u1' || where.id === 'm1' ? { id: 'm1' } : null,
      },
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: null }) },
      vote: { upsert: async ({ where }: any) => { whereRecu = where; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'CONTRE' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ sens: 'CONTRE' })
    expect(whereRecu).toEqual({ resolutionId_membreId: { resolutionId: 'r1', membreId: 'm1' } })
    await app.close()
  })

  // RÉGRESSION (isolation tenant, défense en profondeur) : le service revérifie `membreId` par une
  // lecture SCOPÉE au lieu de faire confiance à l'appelant. Sans cette garde, un membre d'une AUTRE
  // organisation passerait — l'extension tenant force `organisationId` dans le `create` de l'upsert
  // mais laisse les autres FK telles quelles, produisant un Vote de l'org courante pointant vers un
  // membre étranger (la contrainte de clé étrangère, elle, est satisfaite). Non exploitable par la
  // route actuelle, qui résout le membre depuis `req.user.sub` ; la garde protège le PROCHAIN appelant.
  it('membre hors organisation (lecture scopée → null) → 404, aucun vote écrit', async () => {
    let upsertAppele = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      // La route trouve le membre (compte lié), mais la revérification scopée par `id` ne le voit
      // pas — c'est exactement ce que renverrait l'extension pour un membre d'une autre org.
      membre: {
        findFirst: async ({ where }: any) => (where.compteUtilisateurId === 'u1' ? { id: 'm-autre-org' } : null),
      },
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: null }) },
      vote: { upsert: async () => { upsertAppele = true; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(404)
    expect(upsertAppele, "aucune écriture ne doit avoir lieu avant l'échec de la garde").toBe(false)
    await app.close()
  })

  it('résolution clôturée (dateVote posé) → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      membre: { findFirst: async () => ({ id: 'm1' }) },
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', dateVote: new Date() }) },
      vote: { upsert: async () => { throw new Error('ne doit pas être appelé') } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('sens invalide → 400 (schéma)', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'PEUT_ETRE' } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  // RÉGRESSION (bruit documentaire + intégrité) : une résolution documentaire (jamais mise au vote,
  // `ouvertAuVote` false) n'est PAS votable — sinon un vote fortuit écraserait son statut à la
  // clôture. Refus 409, aucune écriture.
  it('résolution non ouverte au vote (ouvertAuVote false) → 409, aucun vote écrit', async () => {
    let upsertAppele = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      membre: { findFirst: async () => ({ id: 'm1' }) },
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: false, dateVote: null }) },
      vote: { upsert: async () => { upsertAppele = true; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'POUR' } })
    expect(res.statusCode).toBe(409)
    expect(upsertAppele).toBe(false)
    await app.close()
  })
})

describe('dépouillement & clôture côté dirigeant', () => {
  it('GET /resolutions/:id/votes sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/resolutions/r1/votes' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  // RÉGRESSION (confidentialité du scrutin) : le dépouillement est NOMINATIF. Gardé par la
  // matrice `Reunion`/`read` — qui accorde `read` à MEMBRE_SIMPLE — il exposait à tout membre de
  // l'organisation qui avait voté quoi, y compris sur un conflit ou une exclusion. La garde est
  // donc `requireRoles(ROLES_BUREAU)`, et ce test est ce qui l'empêche de retomber dans la matrice.
  it('GET votes par un MEMBRE_SIMPLE → 403 (scrutin réservé au bureau)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: null }) },
      vote: { findMany: async () => [{ membreId: 'm1', sens: 'POUR', membre: { nom: 'A', prenom: 'x' } }] },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/resolutions/r1/votes', headers: authMembre(app) })
    expect(res.statusCode).toBe(403)
    // Aucune donnée de scrutin ne doit fuiter dans le corps du refus.
    expect(res.body).not.toContain('POUR')
    await app.close()
  })

  it('GET votes → tally + votes nominatifs + drapeau ouvert', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: null }) },
      vote: {
        findMany: async () => [
          { membreId: 'm1', sens: 'POUR', membre: { nom: 'A', prenom: 'x' } },
          { membreId: 'm2', sens: 'CONTRE', membre: { nom: 'B', prenom: 'y' } },
          { membreId: 'm3', sens: 'POUR', membre: { nom: 'C', prenom: 'z' } },
        ],
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/resolutions/r1/votes', headers: authAdmin(app) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.depouillement).toEqual({ POUR: 2, CONTRE: 1, ABSTENTION: 0, total: 3 })
    expect(body.votes).toHaveLength(3)
    expect(body.resolution.ouvert).toBe(true)
    await app.close()
  })

  it('POST cloturer → statut ADOPTEE dérivé (POUR>CONTRE) + dateVote posé', async () => {
    let dataRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: {
        findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: null }),
        update: async ({ data }: any) => { dataRecu = data; return {} },
      },
      vote: {
        findMany: async () => [{ sens: 'POUR' }, { sens: 'POUR' }, { sens: 'CONTRE' }, { sens: 'ABSTENTION' }],
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/cloturer', headers: authAdmin(app) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.statut).toBe('ADOPTEE')
    expect(body.depouillement).toEqual({ POUR: 2, CONTRE: 1, ABSTENTION: 1, total: 4 })
    expect((dataRecu as { statut: string }).statut).toBe('ADOPTEE')
    expect((dataRecu as { dateVote: unknown }).dateVote).toBeInstanceOf(Date)
    await app.close()
  })

  it('POST cloturer sur une résolution déjà clôturée → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: {
        findFirst: async () => ({ id: 'r1', statut: 'REJETEE', ouvertAuVote: true, dateVote: new Date() }),
        update: async () => { throw new Error('ne doit pas être appelé') },
      },
      vote: { findMany: async () => [] },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/cloturer', headers: authAdmin(app) })
    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('POST cloturer sur une résolution jamais mise au vote → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: {
        findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: false, dateVote: null }),
        update: async () => { throw new Error('ne doit pas être appelé') },
      },
      vote: { findMany: async () => [] },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/cloturer', headers: authAdmin(app) })
    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('POST ouvrir-vote (ADMIN) met ouvertAuVote à true', async () => {
    let dataRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: {
        findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: false, dateVote: null }),
        update: async ({ data }: any) => { dataRecu = data; return {} },
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/ouvrir-vote', headers: authAdmin(app) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'r1', ouvertAuVote: true })
    expect((dataRecu as { ouvertAuVote: boolean }).ouvertAuVote).toBe(true)
    await app.close()
  })

  it('POST ouvrir-vote sur une résolution déjà clôturée → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: {
        findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', ouvertAuVote: true, dateVote: new Date() }),
        update: async () => { throw new Error('ne doit pas être appelé') },
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/ouvrir-vote', headers: authAdmin(app) })
    expect(res.statusCode).toBe(409)
    await app.close()
  })
})
