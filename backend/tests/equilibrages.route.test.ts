import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Équilibrage (§4.3) : permissions (§2), simulation sans écriture, application
 * transactionnelle, contrainte bloquante sur la somme (400). Prisma mocké stateful.
 */

interface Contribution {
  id: string
  membreId: string
  annee: number
  montantVerse: number
  montantValorise: number
}

function buildMock() {
  const contributions = new Map<string, Contribution>([
    ['c20', { id: 'c20', membreId: 'm1', annee: 2020, montantVerse: 900, montantValorise: 900 }],
    ['c21', { id: 'c21', membreId: 'm1', annee: 2021, montantVerse: 0, montantValorise: 0 }],
    ['c22', { id: 'c22', membreId: 'm1', annee: 2022, montantVerse: 300, montantValorise: 300 }],
  ])
  const equilibrages: Array<Record<string, unknown>> = []
  let seq = 0
  let versementTouche = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versementGuard = async () => {
    versementTouche++
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    contribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        let res = [...contributions.values()]
        if (where?.membreId) res = res.filter((c) => c.membreId === where.membreId)
        if (where?.annee?.gte !== undefined) res = res.filter((c) => c.annee >= where.annee.gte)
        if (where?.annee?.lte !== undefined) res = res.filter((c) => c.annee <= where.annee.lte)
        res.sort((a, b) => a.annee - b.annee)
        return res.map((c) => ({ id: c.id, annee: c.annee, montantValorise: c.montantValorise }))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const c = contributions.get(where.id)!
        if (data.montantValorise !== undefined) c.montantValorise = data.montantValorise
        return { ...c }
      },
    },
    equilibrageContribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        // Détails créés séparément (equilibrageDetail.createMany top-level, cf. Phase B).
        const id = `eq${++seq}`
        const eq = { id, ...data, details: [] as any[] }
        equilibrages.push(eq)
        return eq
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => equilibrages.find((e) => e.id === where.id) ?? null,
      findMany: async () => equilibrages,
    },
    equilibrageDetail: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMany: async ({ data }: any) => {
        const rows: any[] = data ?? []
        rows.forEach((d, i) => {
          const eq = equilibrages.find((e) => e.id === d.equilibrageId)
          if (eq) eq.details.push({ id: `${d.equilibrageId}-d${i}`, ...d })
        })
        return { count: rows.length }
      },
    },
    versement: {
      create: versementGuard,
      update: versementGuard,
      delete: versementGuard,
      findMany: versementGuard,
      findUnique: versementGuard,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(prisma),
  }

  return {
    prisma,
    contributions,
    equilibrages,
    versementTouche: () => versementTouche,
  }
}

describe('Routes Équilibrage (§4.3)', () => {
  let app: FastifyInstance
  let store: ReturnType<typeof buildMock>

  beforeEach(async () => {
    store = buildMock()
    app = await buildApp({ prisma: store.prisma, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const range = { membreId: 'm1', anneeDebut: 2020, anneeFin: 2022 }

  /* --- Simulation ------------------------------------------------------- */

  it('TRESORIERE : POST /equilibrages/simuler renvoie la répartition SANS écrire (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages/simuler',
      headers: auth('TRESORIERE'),
      payload: range,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalPeriode).toBe(1200) // 900 + 0 + 300
    expect(body.repartition).toEqual([
      { annee: 2020, montantAvant: 900, montantPropose: 400 },
      { annee: 2021, montantAvant: 0, montantPropose: 400 },
      { annee: 2022, montantAvant: 300, montantPropose: 400 },
    ])
    // Aucune écriture.
    expect(store.contributions.get('c20')!.montantValorise).toBe(900)
    expect(store.equilibrages).toHaveLength(0)
  })

  /* --- Application ------------------------------------------------------ */

  it('ADMIN : POST /equilibrages applique et met à jour montantValorise (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('ADMIN'),
      payload: range,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().totalPeriode).toBe(1200)
    expect(store.contributions.get('c20')!.montantValorise).toBe(400)
    expect(store.contributions.get('c21')!.montantValorise).toBe(400)
    expect(store.contributions.get('c22')!.montantValorise).toBe(400)
    // montantVerse jamais touché, Versement.* jamais appelé.
    expect(store.contributions.get('c20')!.montantVerse).toBe(900)
    expect(store.versementTouche()).toBe(0)
  })

  it('POST /equilibrages avec montantsAjustes valides (somme === total) applique (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('TRESORIERE'),
      payload: { ...range, montantsAjustes: [1000, 100, 100] }, // somme 1200 OK
    })
    expect(res.statusCode).toBe(201)
    expect(store.contributions.get('c20')!.montantValorise).toBe(1000)
    expect(store.contributions.get('c21')!.montantValorise).toBe(100)
    expect(store.contributions.get('c22')!.montantValorise).toBe(100)
  })

  it('CONTRAINTE BLOQUANTE : Σ montantsAjustes !== totalPeriode → 400, rien écrit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('TRESORIERE'),
      payload: { ...range, montantsAjustes: [1000, 100, 200] }, // somme 1300 ≠ 1200
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/somme/i)
    // Inchangé.
    expect(store.contributions.get('c20')!.montantValorise).toBe(900)
    expect(store.equilibrages).toHaveLength(0)
  })

  /* --- Permissions ------------------------------------------------------ */

  it('SECRETAIRE : POST /equilibrages refusé (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('SECRETAIRE'),
      payload: range,
    })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE : POST /equilibrages refusé (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('MEMBRE_SIMPLE'),
      payload: range,
    })
    expect(res.statusCode).toBe(403)
  })

  it('SECRETAIRE : POST /equilibrages/simuler refusé (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/equilibrages/simuler',
      headers: auth('SECRETAIRE'),
      payload: range,
    })
    expect(res.statusCode).toBe(403)
  })

  /* --- Lecture ---------------------------------------------------------- */

  it('COMMISSAIRE_COMPTES : GET /equilibrages autorisé en lecture (200)', async () => {
    // Applique d'abord un équilibrage pour avoir de la donnée.
    await app.inject({
      method: 'POST',
      url: '/equilibrages',
      headers: auth('ADMIN'),
      payload: range,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/equilibrages?membreId=m1',
      headers: auth('COMMISSAIRE_COMPTES'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('MEMBRE_SIMPLE : GET /equilibrages refusé (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/equilibrages',
      headers: auth('MEMBRE_SIMPLE'),
    })
    expect(res.statusCode).toBe(403)
  })
})
