import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Tests d'intégration du module d'auth via app.inject(), Prisma MOCKÉ.
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement (.env).
 */

const ACTIVE_EMAIL = 'admin@nkoni.local'
const INACTIVE_EMAIL = 'inactive@nkoni.local'
const PASSWORD = 'secret-123'

function buildPrismaMock(passwordHash: string) {
  const active = {
    id: 'u-active',
    email: ACTIVE_EMAIL,
    role: 'ADMIN',
    actif: true,
    passwordHash,
    membre: { id: 'm-1' },
  }
  const inactive = {
    id: 'u-inactive',
    email: INACTIVE_EMAIL,
    role: 'ADMIN',
    actif: false,
    passwordHash,
    membre: null,
  }
  const byId: Record<string, unknown> = {
    'u-active': {
      id: 'u-active',
      email: ACTIVE_EMAIL,
      role: 'ADMIN',
      actif: true,
      membre: { id: 'm-1' },
    },
  }
  return {
    utilisateur: {
      findUnique: async (args: { where: { email?: string; id?: string } }) => {
        const { email, id } = args.where
        if (email === ACTIVE_EMAIL) return active
        if (email === INACTIVE_EMAIL) return inactive
        if (id && byId[id]) return byId[id]
        return null
      },
    },
  }
}

describe('Module auth — /auth/*', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaMock = buildPrismaMock(passwordHash) as any
    app = await buildApp({ prisma: prismaMock, logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /auth/login (identifiants valides) → 200 + accessToken + cookie refresh httpOnly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: PASSWORD },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.accessToken).toBe('string')
    expect(body.user).toMatchObject({ id: 'u-active', email: ACTIVE_EMAIL, role: 'ADMIN' })
    // Pas de refreshToken dans le body (il part en cookie).
    expect(body.refreshToken).toBeUndefined()

    const refreshCookie = res.cookies.find((c) => c.name === 'nkoni_refresh')
    expect(refreshCookie).toBeDefined()
    expect(refreshCookie?.httpOnly).toBe(true)
    expect(refreshCookie?.path).toBe('/auth')
  })

  it('POST /auth/login (mauvais mot de passe) → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: 'mauvais' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('POST /auth/login (compte désactivé) → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: INACTIVE_EMAIL, password: PASSWORD },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('POST /auth/login (corps invalide) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL }, // password manquant
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /auth/refresh (cookie valide) → 200 + nouvel accessToken', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: PASSWORD },
    })
    const refresh = login.cookies.find((c) => c.name === 'nkoni_refresh')!

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { nkoni_refresh: refresh.value },
    })

    expect(res.statusCode).toBe(200)
    expect(typeof res.json().accessToken).toBe('string')
  })

  it('POST /auth/refresh (sans cookie) → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /auth/logout → 204 + efface le cookie refresh', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(204)
    const cleared = res.cookies.find((c) => c.name === 'nkoni_refresh')
    expect(cleared).toBeDefined()
    // clearCookie => expiration dans le passé / maxAge 0
    expect(cleared?.value).toBe('')
  })

  it('GET /auth/me (Bearer access valide) → 200 + profil', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: PASSWORD },
    })
    const accessToken = login.json().accessToken

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      id: 'u-active',
      email: ACTIVE_EMAIL,
      role: 'ADMIN',
      membreId: 'm-1',
    })
  })

  it('GET /auth/me (sans token) → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})
