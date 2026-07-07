import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { membresRoutes } from '../src/routes/membres.route'

/**
 * Test d'intégration de la chaîne auth → permission sur la route factice GET /membres.
 * On construit une app Fastify réelle avec @fastify/jwt (secret de test) et on émet des
 * JWT minimaux — sans module de login complet (hors périmètre de cette étape).
 */

const TEST_SECRET = 'test-secret-nkoni'

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(fastifyJwt, { secret: TEST_SECRET })
  // La route /membres interroge Prisma : on décore un mock minimal (liste vide),
  // suffisant pour tester la chaîne auth → permission sans base de données.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.decorate('prisma', { membre: { findMany: async () => [] } } as any)
  await app.register(membresRoutes)
  await app.ready()
  return app
}

describe('GET /membres — requirePermission("Membre", "read")', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('ADMIN (autorisé en lecture) reçoit 200 et un tableau vide', async () => {
    const token = app.jwt.sign({ role: 'ADMIN' })
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('MEMBRE_SIMPLE (lecture de sa fiche → droit générique OK) reçoit 200', async () => {
    // Le middleware ne vérifie que le droit générique 'read' ; le filtrage
    // « sa propre fiche uniquement » sera fait dans la route plus tard.
    const token = app.jwt.sign({ role: 'MEMBRE_SIMPLE', membreId: 'm-123' })
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GUIDE_RELIGIEUX (aucun droit sur Membre) reçoit 403', async () => {
    const token = app.jwt.sign({ role: 'GUIDE_RELIGIEUX' })
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
    // Message par défaut en FR (token sans préférence de langue).
    expect(res.json().message).toContain("n'a pas la permission")
  })

  it('403 dans la langue du token (langue=EN) → message d’autorisation en anglais (§4)', async () => {
    const token = app.jwt.sign({ role: 'GUIDE_RELIGIEUX', langue: 'EN' })
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
    // La langue portée par le token pilote la traduction, sans requête DB.
    expect(res.json().message).toBe(
      "Role GUIDE_RELIGIEUX does not have permission 'read' on entity 'Membre'.",
    )
  })

  it('Requête sans JWT reçoit 401 (géré par le hook d’auth, pas par requirePermission)', async () => {
    const res = await app.inject({ method: 'GET', url: '/membres' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Unauthorized' })
  })
})
