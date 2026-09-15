import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Spec 2026-09-15 §1.3 : POST /demo/session est l'UNIQUE porte d'entrée de l'espace de démonstration.
 * Un compte de l'organisation démo ne peut ni se connecter (même réponse que des identifiants
 * invalides, aucune fuite d'existence) ni rafraîchir une session — sans quoi un jeton de la démo
 * SANS claim `demo` pourrait exister et écrire.
 */

const EMAIL = 'president@demo.nkoni.local'
const MOT_DE_PASSE = 'mot-de-passe-demo-123'

describe('auth — compte d’une organisation de démonstration', () => {
  let app: FastifyInstance
  // Sessions émises : doit rester à 0. C'est l'assertion qui compte — sans elle, le refresh « passerait »
  // déjà AVANT le correctif (l'émission atteinte, une erreur quelconque serait rattrapée en 401).
  let emissions = 0

  beforeAll(async () => {
    const compte = {
      id: 'u-demo',
      email: EMAIL,
      passwordHash: await hashPassword(MOT_DE_PASSE),
      role: 'ADMIN',
      actif: true,
      organisationId: 'org-demo',
      langue: null,
      sessionEpoch: 0,
      membre: null,
      organisation: { langueDefaut: 'FR', devise: 'FCFA', nom: 'Association Exemple NKONI' },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      utilisateur: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: async ({ where }: any) => (where.email === EMAIL || where.id === 'u-demo' ? compte : null),
        update: async () => compte,
      },
      organisation: { findUnique: async () => ({ actif: true, estDemo: true }) },
      refreshToken: {
        create: async () => {
          emissions++
          return {}
        },
      },
    }
    app = await buildApp({ prisma, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('login : 401 identifiants invalides, aucun cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: MOT_DE_PASSE },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Identifiants invalides.')
    expect(res.cookies.find((c) => c.name === 'nkoni_refresh')).toBeUndefined()
    expect(emissions).toBe(0)
  })

  it('refresh : 401 même avec un refresh token valide', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refresh = (app.jwt as any).refresh.sign({ sub: 'u-demo', typ: 'refresh', epoch: 0 })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { nkoni_refresh: refresh },
    })
    expect(res.statusCode).toBe(401)
    expect(emissions).toBe(0)
  })
})
