import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Readiness (§2.2/§8.3) — `/ready` vérifie que la BASE répond (SELECT 1), à la différence de
 * `/health` (liveness) qui répond toujours. Prisma mocké : `$queryRaw` résout (base OK) ou lève
 * (base à terre). Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement.
 */

async function appAvec(queryRaw: () => Promise<unknown>): Promise<FastifyInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = { $queryRaw: queryRaw } as any
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

describe('Readiness — GET /ready', () => {
  it('base joignable (SELECT 1 OK) → 200 { status: ok }', async () => {
    const app = await appAvec(async () => [{ '?column?': 1 }])
    const res = await app.inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  it('base injoignable (SELECT 1 lève) → 503 degraded, jamais une 500 opaque', async () => {
    const app = await appAvec(async () => {
      throw new Error('ECONNREFUSED')
    })
    const res = await app.inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ status: 'degraded' })
    await app.close()
  })

  it('/health (liveness) reste vert même si la base est à terre — le boot ne doit pas en dépendre', async () => {
    const app = await appAvec(async () => {
      throw new Error('down')
    })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
