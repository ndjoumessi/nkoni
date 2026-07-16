import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * CRUD Membre — matrice §2 + filtrage MEMBRE_SIMPLE + règle §4.1 (Prisma mocké).
 */

const ANNEE_COURANTE = new Date().getFullYear()

function buildPrismaMock(opts: { nbMembres?: number } = {}) {
  const membres = [
    {
      id: 'm1',
      nom: 'Alpha',
      prenom: 'Un',
      statut: 'ACTIF',
      anneeAdhesion: 2020,
      compteUtilisateurId: 'u-simple', // fiche du MEMBRE_SIMPLE de test
    },
    {
      id: 'm2',
      nom: 'Beta',
      prenom: 'Deux',
      statut: 'ACTIF',
      anneeAdhesion: 2019,
      compteUtilisateurId: 'u-autre',
    },
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async (args: any) =>
        args?.where?.compteUtilisateurId
          ? membres.filter((m) => m.compteUtilisateurId === args.where.compteUtilisateurId)
          : membres,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async (args: any) => membres.find((m) => m.id === args.where.id) ?? null,
      // Plafond plan gratuit : par défaut le nb réel de membres du mock (2), surchargeable.
      count: async () => opts.nbMembres ?? membres.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (args: any) => ({ id: 'm-new', ...args.data }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (args: any) => ({ id: args.where.id, ...args.data }),
      delete: async () => ({}),
    },
    brancheFamiliale: {
      findMany: async () => [],
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
    },
    // Verrou consultatif no-op + transaction interactive (passe le mock lui-même comme tx).
    $executeRaw: async () => 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(mock),
  }
  return mock
}

describe('CRUD Membre', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildPrismaMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const membreValide = {
    nom: 'Nouveau',
    prenom: 'Membre',
    anneeAdhesion: 2021,
  }

  it('SECRETAIRE peut créer un membre (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: auth('SECRETAIRE'),
      payload: membreValide,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ nom: 'Nouveau', prenom: 'Membre' })
  })

  it('SECRETAIRE ne peut PAS supprimer un membre (403)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/membres/m1',
      headers: auth('SECRETAIRE'),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('ADMIN peut supprimer un membre (204)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/membres/m1',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(204)
  })

  it('MEMBRE_SIMPLE peut lire SA propre fiche (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m1', // m1.compteUtilisateurId === 'u-simple'
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'm1' })
  })

  it('MEMBRE_SIMPLE ne peut PAS lire la fiche d’un autre (403, pas un vide)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m2', // appartient à 'u-autre'
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('MEMBRE_SIMPLE sur GET /membres ne reçoit QUE sa fiche (1 élément)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 'm1', compteUtilisateurId: 'u-simple' })
  })

  it('ADMIN voit tous les membres sur GET /membres', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(2)
  })

  it('§4.1 : passage à DECEDE sans anneeFinContribution → renseignée à l’année courante', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: auth('ADMIN'),
      payload: { ...membreValide, statut: 'DECEDE' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().anneeFinContribution).toBe(ANNEE_COURANTE)
  })

  it('anneeAdhesion dans le futur → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: auth('ADMIN'),
      payload: { ...membreValide, anneeAdhesion: ANNEE_COURANTE + 1 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Plafond de membres du plan gratuit (§10.2)', () => {
  const membreValide = { nom: 'Nouveau', prenom: 'Membre', anneeAdhesion: 2021 }

  async function appAvec(nbMembres: number): Promise<FastifyInstance> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = await buildApp({ prisma: buildPrismaMock({ nbMembres }) as any, logger: false })
    await app.ready()
    return app
  }
  const adminHeader = (app: FastifyInstance) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: 'u-admin', role: 'ADMIN' })}`,
  })

  it('49 membres → création du 50e AUTORISÉE (201)', async () => {
    const app = await appAvec(49)
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: adminHeader(app),
      payload: membreValide,
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('50 membres → création du 51e BLOQUÉE (403, message plan gratuit)', async () => {
    const app = await appAvec(50)
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: adminHeader(app),
      payload: membreValide,
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
    expect(res.json().message).toMatch(/plan gratuit/i)
    await app.close()
  })
})
