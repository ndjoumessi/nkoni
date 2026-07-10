import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Auto-inscription (§3.1) — POST /organisations/inscription (public).
 * Prisma mocké. Vérifie : création atomique org + admin, auto-login (JWT scopé sur la
 * nouvelle org), email déjà utilisé (409 générique), validation des champs.
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement (.env).
 */

function buildMock(opts: { emailExists?: boolean } = {}) {
  const created: { org?: Record<string, unknown>; admin?: Record<string, unknown> } = {}
  let seq = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    utilisateur: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) =>
        opts.emailExists && where.email ? { id: 'existing' } : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const admin = {
          id: `u${++seq}`,
          email: data.email,
          role: data.role,
          organisationId: data.organisationId,
        }
        created.admin = { ...admin, passwordHash: data.passwordHash }
        return admin
      },
    },
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const org = {
          id: `org${++seq}`,
          nom: data.nom,
          devise: data.devise,
          langueDefaut: data.langueDefaut,
        }
        created.org = org
        return org
      },
    },
    // $transaction interactif : passe le mock lui-même comme tx.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(prisma),
  }
  return { prisma, created }
}

const inscriptionValide = {
  nomOrganisation: 'Famille Test',
  devise: 'FCFA',
  langue: 'FR',
  email: 'fondateur@test.local',
  password: 'motdepasse8',
}

async function appAvec(prisma: unknown): Promise<FastifyInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = await buildApp({ prisma: prisma as any, logger: false })
  await app.ready()
  return app
}

describe('Auto-inscription — POST /organisations/inscription', () => {
  it('inscription valide → 201, org + admin créés (atomique), auto-login scopé sur la nouvelle org', async () => {
    const { prisma, created } = buildMock()
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/organisations/inscription',
      payload: inscriptionValide,
    })
    expect(res.statusCode).toBe(201)

    // Organisation créée avec devise/langue fournies.
    expect(created.org).toMatchObject({ nom: 'Famille Test', devise: 'FCFA', langueDefaut: 'FR' })
    // Admin ADMIN rattaché à CETTE organisation (créés dans la même transaction).
    expect(created.admin).toMatchObject({ role: 'ADMIN', email: 'fondateur@test.local' })
    expect(created.admin?.['organisationId']).toBe(created.org?.['id'])
    // passwordHash présent (hashé), jamais le mot de passe en clair.
    expect(created.admin?.['passwordHash']).toBeTypeOf('string')
    expect(created.admin?.['passwordHash']).not.toBe('motdepasse8')

    // Réponse : accessToken + user (sans passwordHash), cookie refresh posé.
    const body = res.json()
    expect(typeof body.accessToken).toBe('string')
    expect(body.user).toMatchObject({ email: 'fondateur@test.local', role: 'ADMIN' })
    expect(res.cookies.find((c) => c.name === 'nkoni_refresh')).toBeTruthy()

    // Le JWT émis porte le rôle ADMIN ET l'organisationId de la nouvelle org (isolation §2.2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = app.jwt.decode(body.accessToken) as any
    expect(claims.role).toBe('ADMIN')
    expect(claims.organisationId).toBe(created.org?.['id'])

    await app.close()
  })

  it('email déjà utilisé → 409 (message générique, pas de révélation)', async () => {
    const { prisma } = buildMock({ emailExists: true })
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/organisations/inscription',
      payload: inscriptionValide,
    })
    expect(res.statusCode).toBe(409)
    // Message générique : ne dit pas « email déjà pris » explicitement.
    expect(res.json().message).not.toMatch(/déjà|existe|pris/i)
    await app.close()
  })

  it('validation : devise hors enum, email invalide, mot de passe trop court, champ manquant → 400', async () => {
    const { prisma } = buildMock()
    const app = await appAvec(prisma)
    const cas = [
      { ...inscriptionValide, devise: 'GBP' }, // devise hors enum
      { ...inscriptionValide, langue: 'ES' }, // langue hors enum
      { ...inscriptionValide, email: 'pas-un-email' }, // email invalide
      { ...inscriptionValide, password: 'court' }, // < 8 caractères
      { ...inscriptionValide, nomOrganisation: '' }, // nom vide
      { devise: 'FCFA', langue: 'FR', email: 'a@b.co', password: 'motdepasse8' }, // nom manquant
    ]
    for (const payload of cas) {
      const res = await app.inject({ method: 'POST', url: '/organisations/inscription', payload })
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
    await app.close()
  })
})

/**
 * Paramètres de l'organisation courante — GET /organisations/moi (§5).
 * Prisma mocké. Vérifie : contenu (nom/devise/langue/date + membres/limite), permissions
 * (bureau OUI, MEMBRE_SIMPLE NON), auth requise.
 */
// Membres avec statuts variés : le quota ne doit compter QUE les ACTIF.
const MEMBRES_TEST = [
  ...Array.from({ length: 42 }, () => ({ statut: 'ACTIF' })),
  { statut: 'DECEDE' },
  { statut: 'INACTIF' },
  { statut: 'DECEDE' },
]

function buildMoiMock(membres: { statut: string }[] = MEMBRES_TEST) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    organisation: {
      findUnique: async () => ({
        id: 'org-1',
        nom: 'WAMBA TCHOUPA',
        devise: 'EUR',
        langueDefaut: 'FR',
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
      }),
    },
    membre: {
      // Applique le filtre `where.statut` comme le vrai Prisma → vérifie qu'on ne compte que les ACTIF.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async (args: any = {}) => {
        const statut = args?.where?.statut
        return membres.filter((m) => (statut ? m.statut === statut : true)).length
      },
    },
  }
  return prisma
}

const authMoi = (app: FastifyInstance, role: string, organisationId: string | undefined = 'org-1') => ({
  authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role, ...(organisationId ? { organisationId } : {}) })}`,
})

describe('Paramètres organisation — GET /organisations/moi', () => {
  it('ADMIN → 200, paramètres immuables + quota = membres ACTIFS uniquement / limite forfait (100)', async () => {
    // 45 fiches au total (42 ACTIF + 3 DECEDE/INACTIF) → le quota ne compte que les 42 actifs.
    const app = await appAvec(buildMoiMock())
    const res = await app.inject({ method: 'GET', url: '/organisations/moi', headers: authMoi(app, 'ADMIN') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      id: 'org-1',
      nom: 'WAMBA TCHOUPA',
      devise: 'EUR',
      langueDefaut: 'FR',
      nbMembres: 42, // et non 45 : les fiches décédées/inactives ne consomment pas le quota
      limiteMembres: 100,
    })
    await app.close()
  })

  it('PRESIDENT (rôle du bureau) → 200', async () => {
    const app = await appAvec(buildMoiMock())
    const res = await app.inject({ method: 'GET', url: '/organisations/moi', headers: authMoi(app, 'PRESIDENT') })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('MEMBRE_SIMPLE → 403 (quota = information de gestion, hors périmètre du membre)', async () => {
    const app = await appAvec(buildMoiMock())
    const res = await app.inject({ method: 'GET', url: '/organisations/moi', headers: authMoi(app, 'MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('sans authentification → 401', async () => {
    const app = await appAvec(buildMoiMock())
    const res = await app.inject({ method: 'GET', url: '/organisations/moi' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

/**
 * Chef de l'organisation — PATCH /organisations/moi/chef.
 * Prisma mocké. Vérifie : désignation (+ trim du surnom), retrait (membreId null), refus si le
 * membre n'appartient pas à l'org (isolation tenant simulée par un findUnique scopé → null),
 * garde de rôle (ADMIN/PRESIDENT seulement), auth requise.
 */
function buildChefMock() {
  const MEMBRES: Record<string, { nom: string; prenom: string }> = {
    'm-1': { nom: 'NGONO', prenom: 'Marie' },
  }
  const state = { chefMembreId: null as string | null, chefSurnom: null as string | null, updates: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    membre: {
      // Simule l'extension d'isolation : un id inconnu OU d'une autre org → null (fail-closed).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => (where.id in MEMBRES ? { id: where.id } : null),
    },
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ data }: any) => {
        state.updates += 1
        state.chefMembreId = data.chefMembreId
        state.chefSurnom = data.chefSurnom
        const chef = state.chefMembreId ? MEMBRES[state.chefMembreId] : null
        return { chefMembreId: state.chefMembreId, chefSurnom: state.chefSurnom, chef }
      },
    },
  }
  return { prisma, state }
}

const patchChef = (
  app: FastifyInstance,
  role: string,
  payload: unknown,
  organisationId: string | undefined = 'org-1',
) =>
  app.inject({
    method: 'PATCH',
    url: '/organisations/moi/chef',
    headers: authMoi(app, role, organisationId),
    payload: payload as Record<string, unknown>,
  })

describe('Chef de l’organisation — PATCH /organisations/moi/chef', () => {
  it('ADMIN désigne un membre + surnom (trimé) → 200, écrit chefMembreId scalaire', async () => {
    const { prisma, state } = buildChefMock()
    const app = await appAvec(prisma)
    const res = await patchChef(app, 'ADMIN', { membreId: 'm-1', surnom: '  Le Patriarche  ' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      chefMembreId: 'm-1',
      chefSurnom: 'Le Patriarche', // trimé
      chefNom: 'NGONO',
      chefPrenom: 'Marie',
    })
    expect(state.chefMembreId).toBe('m-1')
    await app.close()
  })

  it('PRESIDENT retire le chef (membreId null) → 200, chef + surnom remis à null', async () => {
    const { prisma, state } = buildChefMock()
    state.chefMembreId = 'm-1' // un chef existait
    const app = await appAvec(prisma)
    const res = await patchChef(app, 'PRESIDENT', { membreId: null })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      chefMembreId: null,
      chefSurnom: null,
      chefNom: null,
      chefPrenom: null,
    })
    await app.close()
  })

  it('membre hors organisation (isolation tenant) → 404, aucune écriture', async () => {
    const { prisma, state } = buildChefMock()
    const app = await appAvec(prisma)
    const res = await patchChef(app, 'ADMIN', { membreId: 'm-autre-org' })
    expect(res.statusCode).toBe(404)
    expect(state.updates).toBe(0) // refus AVANT toute écriture sur l'organisation
    await app.close()
  })

  it('garde de rôle : TRESORIERE / SECRETAIRE / MEMBRE_SIMPLE → 403, aucune écriture', async () => {
    for (const role of ['TRESORIERE', 'SECRETAIRE', 'MEMBRE_SIMPLE']) {
      const { prisma, state } = buildChefMock()
      const app = await appAvec(prisma)
      const res = await patchChef(app, role, { membreId: 'm-1' })
      expect(res.statusCode, role).toBe(403)
      expect(state.updates, role).toBe(0)
      await app.close()
    }
  })

  it('sans authentification → 401', async () => {
    const { prisma } = buildChefMock()
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PATCH', url: '/organisations/moi/chef', payload: { membreId: 'm-1' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
