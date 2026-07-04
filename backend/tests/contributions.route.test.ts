import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Contributions : ouverture d'année, statut cumulatif (branché sur la fonction
 * pure) et lecture filtrée pour MEMBRE_SIMPLE. Prisma mocké.
 */

const baremes = [
  { annee: 2020, montantAttendu: 10_000 },
  { annee: 2021, montantAttendu: 10_000 },
  { annee: 2022, montantAttendu: 10_000 },
  { annee: 2023, montantAttendu: 10_000 },
]
const membresById: Record<string, unknown> = {
  m1: { id: 'm1', anneeAdhesion: 2020, anneeFinContribution: 2022, compteUtilisateurId: 'u-simple' },
  m2: { id: 'm2', anneeAdhesion: 2019, anneeFinContribution: null, compteUtilisateurId: 'u-autre' },
}
const contributions = [
  { id: 'c1', membreId: 'm1', annee: 2020, montantValorise: 10_000 },
  { id: 'c2', membreId: 'm1', annee: 2021, montantValorise: 10_000 },
  { id: 'c3', membreId: 'm1', annee: 2022, montantValorise: 10_000 },
  { id: 'c4', membreId: 'm2', annee: 2020, montantValorise: 5_000 },
]
const compteParMembre: Record<string, string> = { m1: 'u-simple', m2: 'u-autre' }

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    baremeAnnuel: {
      findUnique: async ({ where }: any) =>
        where.annee === 2025 ? { id: 'b2025', annee: 2025, montantAttendu: 12_000 } : null,
      findMany: async () => baremes,
    },
    membre: {
      findMany: async () => [{ id: 'ma' }, { id: 'mb' }], // éligibles pour ouvrir-annee
      findUnique: async ({ where }: any) => membresById[where.id] ?? null,
    },
    contribution: {
      createMany: async ({ data }: any) => ({ count: data.length }),
      findMany: async ({ where }: any) => {
        let res = contributions
        if (where?.membreId) res = res.filter((c) => c.membreId === where.membreId)
        if (where?.annee) res = res.filter((c) => c.annee === where.annee)
        const compte = where?.membre?.compteUtilisateurId
        if (compte) res = res.filter((c) => compteParMembre[c.membreId] === compte)
        return res
      },
    },
    versement: { findMany: async () => [] },
  }
}

describe('Routes Contributions (§5 points 4-5)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  it('ADMIN : POST /contributions/ouvrir-annee crée les contributions (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contributions/ouvrir-annee',
      headers: auth('ADMIN'),
      payload: { annee: 2025 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ annee: 2025, contributionsCreees: 2 })
  })

  it('TRESORIERE : ouvrir-annee autorisé (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contributions/ouvrir-annee',
      headers: auth('TRESORIERE'),
      payload: { annee: 2025 },
    })
    expect(res.statusCode).toBe(201)
  })

  it('ouvrir-annee sans barème pour l’année → 400 explicite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contributions/ouvrir-annee',
      headers: auth('ADMIN'),
      payload: { annee: 2030 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/barème/i)
  })

  it('SECRETAIRE : ouvrir-annee refusé (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contributions/ouvrir-annee',
      headers: auth('SECRETAIRE'),
      payload: { annee: 2025 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET /membres/:id/statut cohérent avec calculerStatutContribution', async () => {
    // m1 : adhésion 2020, fin 2022 → borne 2020..2022 ; attendu 30 000, valorisé 30 000.
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m1/statut',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      totalAttenduCumule: 30_000,
      totalValoriseCumule: 30_000,
      statut: 'A_JOUR',
    })
  })

  it('MEMBRE_SIMPLE peut consulter SON statut (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m1/statut',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
  })

  it('MEMBRE_SIMPLE ne peut PAS consulter le statut d’un autre (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m2/statut',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET /contributions : MEMBRE_SIMPLE ne voit que les siennes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/contributions',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(3) // c1, c2, c3 (m1) — pas c4 (m2)
    expect(body.every((c: { membreId: string }) => c.membreId === 'm1')).toBe(true)
  })
})
