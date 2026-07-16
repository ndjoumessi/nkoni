import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Suspension d'organisation (SaaS §2.3) — un utilisateur tenant d'un espace suspendu ne peut
 * ni se connecter (403) ni rafraîchir sa session (401). Prisma mocké, avec un statut d'org
 * MUTABLE pour tester la suspension entre un login (actif) et un refresh (devenu suspendu).
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (.env).
 */

const PASSWORD = 'secret-123'
const EMAIL_SUSPENDU = 'admin@suspendu.local'
const EMAIL_ACTIF = 'admin@actif.local'

function buildMock(passwordHash: string) {
  const users: Record<string, Record<string, unknown>> = {
    [EMAIL_SUSPENDU]: {
      id: 'u-susp', email: EMAIL_SUSPENDU, role: 'ADMIN', actif: true,
      organisationId: 'org-susp', passwordHash, membre: null,
    },
    [EMAIL_ACTIF]: {
      id: 'u-actif', email: EMAIL_ACTIF, role: 'ADMIN', actif: true,
      organisationId: 'org-actif', passwordHash, membre: null,
    },
  }
  // Statut MUTABLE : 'org-actif' peut être suspendue en cours de test.
  const orgActif: Record<string, boolean> = { 'org-susp': false, 'org-actif': true }
  const prisma = {
    utilisateur: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async (args: any) => {
        const { email, id } = args.where
        if (email) return users[email] ?? null
        if (id) return Object.values(users).find((u) => u['id'] === id) ?? null
        return null
      },
    },
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async (args: any) => {
        const id = args.where.id as string
        return id in orgActif ? { actif: orgActif[id] } : null
      },
    },
    // RefreshToken stateful (rotation M5) : login crée, refresh lit puis rote.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    refreshToken: (() => {
      const store = new Map<string, any>()
      return {
        create: async ({ data }: any) => {
          store.set(data.jti, { ...data })
          return { ...data }
        },
        findUnique: async ({ where }: any) => store.get(where.jti) ?? null,
        update: async ({ where, data }: any) => {
          const r = store.get(where.jti)
          if (r) Object.assign(r, data)
          return r
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0
          for (const r of store.values()) {
            if (r.familleId === where.familleId) {
              Object.assign(r, data)
              count++
            }
          }
          return { count }
        },
      }
    })(),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
  return { prisma, orgActif }
}

describe('Suspension d\'organisation — login & refresh', () => {
  let app: FastifyInstance
  let orgActif: Record<string, boolean>

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD)
    const mock = buildMock(passwordHash)
    orgActif = mock.orgActif
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: mock.prisma as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('login dans une organisation ACTIVE → 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: EMAIL_ACTIF, password: PASSWORD },
    })
    expect(res.statusCode).toBe(200)
  })

  it('login dans une organisation SUSPENDUE → 403 (message explicite « suspendu »)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: EMAIL_SUSPENDU, password: PASSWORD },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toMatch(/suspendu/i)
  })

  it('refresh après suspension de l\'organisation → 401 (déconnexion forcée)', async () => {
    // 1) Login pendant que l'org est ACTIVE → cookie refresh valide (émis par le vrai flux).
    orgActif['org-actif'] = true
    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: EMAIL_ACTIF, password: PASSWORD },
    })
    expect(login.statusCode).toBe(200)
    const refresh = login.cookies.find((c) => c.name === 'nkoni_refresh')!
    expect(refresh).toBeDefined()

    // 2) L'organisation est suspendue.
    orgActif['org-actif'] = false

    // 3) Le refresh est désormais refusé (session invalide) → l'utilisateur est déconnecté.
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      cookies: { nkoni_refresh: refresh.value },
    })
    expect(res.statusCode).toBe(401)
  })

  it('refresh tant que l\'organisation reste ACTIVE → 200', async () => {
    orgActif['org-actif'] = true
    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: EMAIL_ACTIF, password: PASSWORD },
    })
    const refresh = login.cookies.find((c) => c.name === 'nkoni_refresh')!
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      cookies: { nkoni_refresh: refresh.value },
    })
    expect(res.statusCode).toBe(200)
  })
})
