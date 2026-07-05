import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Isolation multi-tenant DE BOUT EN BOUT (SaaS §2.2) — via `app.inject()` sur l'application
 * RÉELLE (buildApp → client Prisma étendu par l'audit ET l'isolation), contre la vraie base.
 *
 * Prouve le CÂBLAGE de la Phase C2 (que les tests mockés ne couvrent pas) :
 *   - login/refresh (lectures pré-auth) fonctionnent malgré le fail-closed (runUnscoped) ;
 *   - le JWT porte organisationId → `authenticate` établit le contexte → une requête
 *     authentifiée ne voit QUE les données de l'org du demandeur (findMany scopé) ;
 *   - pas de fuite par accès direct (findUnique par id d'une autre org → 404) ;
 *   - /auth/me fonctionne sous contexte org.
 *
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement (.env) + DATABASE_URL.
 */

const ORG_A = 'a1000000-0000-4000-8000-000000000001'
const ORG_B = 'b1000000-0000-4000-8000-000000000002'
const EMAIL_A = 'admin-a@tenant-it.local'
const PASSWORD = 'secret-123'
const REFRESH_COOKIE = process.env['REFRESH_COOKIE_NAME'] ?? 'nkoni_refresh'

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance
let membreBId = ''

/** Nettoyage idempotent via `base` (non scopé). Ordre FK : membres → users → orgs. */
async function nettoyer(): Promise<void> {
  await base.membre.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.utilisateur.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.organisation.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG_A, nom: 'Tenant IT A', devise: 'FCFA' } })
  await base.organisation.create({ data: { id: ORG_B, nom: 'Tenant IT B', devise: 'FCFA' } })
  await base.utilisateur.create({
    data: { organisationId: ORG_A, email: EMAIL_A, passwordHash: await hashPassword(PASSWORD), role: 'ADMIN' },
  })
  await base.membre.create({ data: { organisationId: ORG_A, nom: 'Alpha', prenom: 'A', anneeAdhesion: 2020 } })
  const mB = await base.membre.create({
    data: { organisationId: ORG_B, nom: 'Bravo', prenom: 'B', anneeAdhesion: 2020 },
  })
  membreBId = mB.id
  app = await buildApp({ logger: false }) // pas de prisma injecté → client réel étendu (défaut)
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

/** Se connecte en tant qu'admin de l'org A ; renvoie l'access token (Bearer) + le refresh. */
async function loginA(): Promise<{ token: string; refresh: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: EMAIL_A, password: PASSWORD },
  })
  expect(res.statusCode).toBe(200)
  const refresh = res.cookies.find((c) => c.name === REFRESH_COOKIE)
  return { token: res.json().accessToken as string, refresh: refresh?.value ?? '' }
}

describe('Isolation multi-tenant de bout en bout (HTTP, extension branchée)', () => {
  it('login : la lecture pré-auth (non scopée) réussit et émet un access token', async () => {
    const { token } = await loginA()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('GET /membres : ne renvoie QUE les membres de l’organisation du demandeur', async () => {
    const { token } = await loginA()
    const res = await app.inject({
      method: 'GET',
      url: '/membres',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const noms = (res.json() as Array<{ nom: string }>).map((m) => m.nom)
    expect(noms).toContain('Alpha') // sa propre org
    expect(noms).not.toContain('Bravo') // org B jamais exposée
  })

  it('GET /membres/:id d’une AUTRE org → 404 (pas de fuite par accès direct)', async () => {
    const { token } = await loginA()
    const res = await app.inject({
      method: 'GET',
      url: `/membres/${membreBId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /auth/refresh : le flux pré-auth (non scopé) réémet un access token', async () => {
    const { refresh } = await loginA()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { [REFRESH_COOKIE]: refresh },
    })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().accessToken).toBe('string')
  })

  it('GET /auth/me (sous contexte org) : renvoie le profil du demandeur', async () => {
    const { token } = await loginA()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe(EMAIL_A)
  })
})
