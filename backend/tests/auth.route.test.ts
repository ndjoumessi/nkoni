import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
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
    // Same-origin (proxy Vercel) → SameSite=Lax (protection CSRF), plus SameSite=None.
    expect(refreshCookie?.sameSite?.toLowerCase()).toBe('lax')
  })

  it('POST /auth/login sans rememberMe → cookie refresh Max-Age 7 jours (session standard)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: PASSWORD },
    })
    const cookie = res.cookies.find((c) => c.name === 'nkoni_refresh')
    expect(cookie?.maxAge).toBe(7 * 24 * 60 * 60)
  })

  it('POST /auth/login avec rememberMe → cookie refresh Max-Age 30 jours (session longue)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: PASSWORD, rememberMe: true },
    })
    const cookie = res.cookies.find((c) => c.name === 'nkoni_refresh')
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60)
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

  it('POST /auth/login (mauvais mot de passe) → message FR par défaut', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: ACTIVE_EMAIL, password: 'mauvais' },
    })
    expect(res.json().message).toBe('Identifiants invalides.')
  })

  it('POST /auth/login (mauvais mot de passe, Accept-Language: en) → message EN (§4)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      payload: { email: ACTIVE_EMAIL, password: 'mauvais' },
    })
    // Pré-auth (pas de token) → langue résolue depuis Accept-Language.
    expect(res.json().message).toBe('Invalid credentials.')
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

describe('POST /auth/changer-mot-de-passe (self-service)', () => {
  let app: FastifyInstance
  const EMAIL = 'self@nkoni.local'
  const OLD = 'ancien-secret-1'
  const NEW = 'nouveau-secret-1'

  // Mock isolé avec `update` mutable : le changement de hash doit se refléter sur les
  // lectures suivantes (findUnique renvoie la même référence).
  function buildMock(passwordHash: string) {
    const user = {
      id: 'u-1',
      email: EMAIL,
      role: 'MEMBRE_SIMPLE',
      actif: true,
      passwordHash,
      membre: null,
    }
    return {
      utilisateur: {
        findUnique: async (args: { where: { email?: string; id?: string } }) => {
          const { email, id } = args.where
          if (email === EMAIL || id === 'u-1') return user
          return null
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          if (args.where.id === 'u-1') Object.assign(user, args.data)
          return user
        },
      },
    }
  }

  beforeEach(async () => {
    const passwordHash = await (await import('../src/services/auth.service')).hashPassword(OLD)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock(passwordHash) as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const bearer = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: 'u-1', role: 'MEMBRE_SIMPLE' })}`,
  })

  it('ancien mot de passe correct → 204, et le nouveau devient actif', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/changer-mot-de-passe',
      headers: bearer(),
      payload: { ancienMotDePasse: OLD, nouveauMotDePasse: NEW },
    })
    expect(res.statusCode).toBe(204)

    const avecAncien = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: OLD },
    })
    expect(avecAncien.statusCode).toBe(401)

    const avecNouveau = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: NEW },
    })
    expect(avecNouveau.statusCode).toBe(200)
  })

  it('ancien mot de passe incorrect → 401 (aucun changement)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/changer-mot-de-passe',
      headers: bearer(),
      payload: { ancienMotDePasse: 'mauvais', nouveauMotDePasse: NEW },
    })
    expect(res.statusCode).toBe(401)

    // L'ancien mot de passe fonctionne toujours.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: OLD },
    })
    expect(login.statusCode).toBe(200)
  })

  it('sans token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/changer-mot-de-passe',
      payload: { ancienMotDePasse: OLD, nouveauMotDePasse: NEW },
    })
    expect(res.statusCode).toBe(401)
  })

  it('nouveau mot de passe trop court → 400 (validation de schéma)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/changer-mot-de-passe',
      headers: bearer(),
      payload: { ancienMotDePasse: OLD, nouveauMotDePasse: 'court' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Révocation par époque de session (audit M5)', () => {
  const EMAIL = 'epoch@nkoni.local'
  const OLD = 'ancien-secret-9'
  const NEW = 'nouveau-secret-9'

  // Mock où `sessionEpoch` s'incrémente RÉELLEMENT sur `{ increment }` (contrairement au mock
  // simple qui ferait un Object.assign) — indispensable pour tester la révocation.
  async function buildApp9(): Promise<FastifyInstance> {
    const user: any = {
      id: 'u-9',
      email: EMAIL,
      role: 'MEMBRE_SIMPLE',
      actif: true,
      organisationId: 'org-1',
      passwordHash: await hashPassword(OLD),
      membre: null,
      sessionEpoch: 0,
    }
    const prisma: any = {
      utilisateur: {
        findUnique: async ({ where }: any) =>
          where.email === EMAIL || where.id === 'u-9' ? user : null,
        update: async ({ data }: any) => {
          if (data.passwordHash) user.passwordHash = data.passwordHash
          if (data.sessionEpoch?.increment) user.sessionEpoch += data.sessionEpoch.increment
          return user
        },
      },
      // Le refresh vérifie que l'org est active (§2.3).
      organisation: { findUnique: async () => ({ actif: true }) },
    }
    const app = await buildApp({ prisma, logger: false })
    await app.ready()
    return app
  }

  it('un refresh émis AVANT un changement de mot de passe est refusé (401)', async () => {
    const app = await buildApp9()
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: EMAIL, password: OLD },
      })
      expect(login.statusCode).toBe(200)
      const refresh = login.cookies.find((c) => c.name === 'nkoni_refresh')!
      // Le refresh fonctionne tant que l'époque n'a pas bougé.
      const ok = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { nkoni_refresh: refresh.value },
      })
      expect(ok.statusCode).toBe(200)

      // Changement de mot de passe → époque incrémentée.
      const bearer = { authorization: `Bearer ${app.jwt.sign({ sub: 'u-9', role: 'MEMBRE_SIMPLE' })}` }
      const chg = await app.inject({
        method: 'POST',
        url: '/auth/changer-mot-de-passe',
        headers: bearer,
        payload: { ancienMotDePasse: OLD, nouveauMotDePasse: NEW },
      })
      expect(chg.statusCode).toBe(204)

      // L'ANCIEN refresh (époque 0) est désormais périmé → 401.
      const revoked = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { nkoni_refresh: refresh.value },
      })
      expect(revoked.statusCode).toBe(401)

      // Le NOUVEAU cookie refresh réémis par le changement de mot de passe, lui, fonctionne.
      const nouveau = chg.cookies.find((c) => c.name === 'nkoni_refresh')!
      const ok2 = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { nkoni_refresh: nouveau.value },
      })
      expect(ok2.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
})

describe('PATCH /auth/me/langue (préférence de langue perso, §4)', () => {
  let app: FastifyInstance
  const EMAIL = 'langue@nkoni.local'
  const PASSWORD = 'secret-langue-1'

  // `update` mutable : la langue fixée doit se refléter sur les lectures /login /me suivantes.
  // L'org a pour défaut EN → un utilisateur SANS préférence perso hérite de EN (§4).
  function buildMock(passwordHash: string) {
    const user: Record<string, unknown> = {
      id: 'u-lang',
      email: EMAIL,
      role: 'ADMIN',
      actif: true,
      organisationId: 'org-1',
      langue: null,
      passwordHash,
      membre: null,
      organisation: { langueDefaut: 'EN' },
    }
    return {
      utilisateur: {
        findUnique: async (args: { where: { email?: string; id?: string } }) => {
          const { email, id } = args.where
          if (email === EMAIL || id === 'u-lang') return user
          return null
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          if (args.where.id === 'u-lang') Object.assign(user, args.data)
          return user
        },
      },
      // L'org-context de login vérifie que l'espace est actif (§2.3) : org active dans ce mock.
      organisation: {
        findUnique: async () => ({ actif: true }),
      },
    }
  }

  beforeEach(async () => {
    const passwordHash = await hashPassword(PASSWORD)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock(passwordHash) as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const bearer = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: 'u-lang', role: 'ADMIN', organisationId: 'org-1' })}`,
  })

  it('sans préférence perso → /auth/me hérite du défaut de l’organisation (EN)', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: bearer() })
    expect(res.statusCode).toBe(200)
    // langue perso null MAIS org langueDefaut=EN → langue effective = EN (§4).
    expect(res.json().langue).toBe('EN')
  })

  it('PATCH langue=FR → la préférence perso prime sur le défaut de l’org (EN)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/auth/me/langue',
      headers: bearer(),
      payload: { langue: 'FR' },
    })
    expect(patch.statusCode).toBe(200)
    const body = patch.json()
    expect(body.langue).toBe('FR')
    expect(typeof body.accessToken).toBe('string')

    // Le token réémis porte la préférence perso → une lecture ultérieure voit FR (pas EN).
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: bearer() })
    expect(me.json().langue).toBe('FR')

    // La préférence remonte aussi dans la réponse de login.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    })
    expect(login.json().user.langue).toBe('FR')
  })

  it('langue non supportée → 400 (validation de schéma)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me/langue',
      headers: bearer(),
      payload: { langue: 'ES' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sans token → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/auth/me/langue',
      payload: { langue: 'EN' },
    })
    expect(res.statusCode).toBe(401)
  })
})
