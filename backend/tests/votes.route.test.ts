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
      membre: { findFirst: async ({ where }: any) => (where.compteUtilisateurId === 'u1' ? { id: 'm1' } : null) },
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', dateVote: null }) },
      vote: { upsert: async ({ where }: any) => { whereRecu = where; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/resolutions/r1/vote', headers: authMembre(app), payload: { sens: 'CONTRE' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ sens: 'CONTRE' })
    expect(whereRecu).toEqual({ resolutionId_membreId: { resolutionId: 'r1', membreId: 'm1' } })
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
})

describe('dépouillement & clôture côté dirigeant', () => {
  it('GET /resolutions/:id/votes sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/resolutions/r1/votes' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET votes → tally + votes nominatifs + drapeau ouvert', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      resolution: { findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', dateVote: null }) },
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
        findFirst: async () => ({ id: 'r1', statut: 'ADOPTEE', dateVote: null }),
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
        findFirst: async () => ({ id: 'r1', statut: 'REJETEE', dateVote: new Date() }),
        update: async () => { throw new Error('ne doit pas être appelé') },
      },
      vote: { findMany: async () => [] },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/resolutions/r1/cloturer', headers: authAdmin(app) })
    expect(res.statusCode).toBe(409)
    await app.close()
  })
})
