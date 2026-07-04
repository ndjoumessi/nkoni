import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { Prisma } from '../src/generated/prisma/client'

/**
 * CRUD BaremeAnnuel — matrice §2 + contrainte d'unicité annuelle (409). Prisma mocké.
 */

function buildMock() {
  const annees = new Set<number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    baremeAnnuel: {
      findMany: async () => [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        if (annees.has(data.annee)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          })
        }
        annees.add(data.annee)
        return { id: `b${data.annee}`, ...data }
      },
    },
    membre: { findMany: async () => [], findUnique: async () => null },
  }
}

describe('CRUD BaremeAnnuel', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role })}`,
  })

  it('ADMIN peut créer un barème (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/baremes',
      headers: auth('ADMIN'),
      payload: { annee: 2025, montantAttendu: 12_000 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ annee: 2025, montantAttendu: 12_000 })
  })

  it('Créer un barème pour une année déjà existante → 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/baremes',
      headers: auth('ADMIN'),
      payload: { annee: 2025, montantAttendu: 12_000 },
    })
    const dup = await app.inject({
      method: 'POST',
      url: '/baremes',
      headers: auth('ADMIN'),
      payload: { annee: 2025, montantAttendu: 15_000 },
    })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ error: 'Conflict' })
  })

  it('TRESORIERE peut lire les barèmes (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/baremes', headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
  })

  it('SECRETAIRE ne peut PAS lire les barèmes (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/baremes', headers: auth('SECRETAIRE') })
    expect(res.statusCode).toBe(403)
  })

  it('TRESORIERE ne peut PAS créer un barème (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/baremes',
      headers: auth('TRESORIERE'),
      payload: { annee: 2026, montantAttendu: 12_000 },
    })
    expect(res.statusCode).toBe(403)
  })
})
