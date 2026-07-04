import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * CRUD BrancheFamiliale — conformité à la matrice §2 (app.inject, Prisma mocké).
 */

function buildPrismaMock() {
  const branches = [
    { id: 'b1', nom: 'Branche A', description: null, createdAt: new Date(0) },
  ]
  return {
    brancheFamiliale: {
      findMany: async () => branches,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (args: any) => ({
        id: 'b-new',
        createdAt: new Date(0),
        ...args.data,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (args: any) => ({ id: args.where.id, ...args.data }),
      delete: async () => ({}),
    },
    // Stubs (les routes membres sont enregistrées mais non exercées ici).
    membre: {
      findMany: async () => [],
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
    },
  }
}

describe('CRUD BrancheFamiliale', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildPrismaMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role })}`,
  })

  it('ADMIN peut lister les branches (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/branches', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('ADMIN peut créer une branche (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/branches',
      headers: auth('ADMIN'),
      payload: { nom: 'Nouvelle branche', description: 'desc' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ nom: 'Nouvelle branche', description: 'desc' })
  })

  it('ADMIN peut modifier (200) et supprimer (204)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/branches/b1',
      headers: auth('ADMIN'),
      payload: { nom: 'Renommée' },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json()).toMatchObject({ nom: 'Renommée' })

    const del = await app.inject({ method: 'DELETE', url: '/branches/b1', headers: auth('ADMIN') })
    expect(del.statusCode).toBe(204)
  })

  it('TRESORIERE peut lire les branches (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/branches', headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
  })

  it('TRESORIERE ne peut PAS créer une branche (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/branches',
      headers: auth('TRESORIERE'),
      payload: { nom: 'Interdite' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('MEMBRE_SIMPLE ne peut PAS lire les branches (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/branches', headers: auth('MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })
})
