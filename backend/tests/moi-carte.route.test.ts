import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Carte de membre SELF-SERVICE — GET /moi/carte. On vérifie les GARDES (auth + fiche liée), qui
 * court-circuitent AVANT toute génération PDF ; le rendu PDF lui-même est couvert par la route
 * bureau. Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const auth = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1' })}`,
})

describe('GET /moi/carte (self-service)', () => {
  it('sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/moi/carte' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('compte sans fiche membre liée → 404, aucune génération', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/moi/carte', headers: auth(app) })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
