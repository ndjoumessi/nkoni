import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * POST /demo/session (spec 2026-09-15 §1.2) : public, 404 tant que la démo est éteinte ou absente,
 * sinon un access token portant `demo: true` et AUCUN cookie (le cookie de refresh d'un vrai
 * administrateur connecté dans le même navigateur ne doit jamais être écrasé).
 */

const COMPTE = {
  id: 'u-demo',
  email: 'president@demo.nkoni.local',
  role: 'ADMIN',
  actif: true,
  organisationId: 'org-demo',
  langue: null,
  sessionEpoch: 0,
  membre: { id: 'm-president' },
  organisation: { langueDefaut: 'FR', devise: 'FCFA', nom: 'Association Exemple NKONI' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaDemo(options: { org?: boolean; compte?: boolean } = {}): any {
  const { org = true, compte = true } = options
  return {
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) => {
        expect(args.where).toEqual({ estDemo: true, actif: true })
        return org ? { id: 'org-demo' } : null
      },
    },
    utilisateur: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) => {
        expect(args.where).toEqual({ organisationId: 'org-demo', role: 'ADMIN', actif: true })
        return compte ? { id: 'u-demo' } : null
      },
      findUnique: async () => COMPTE,
      update: async () => COMPTE,
    },
  }
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const demarrer = async (demoActivee: boolean, prisma = prismaDemo()) => {
  app = await buildApp({ prisma, logger: false, demoActivee })
  await app.ready()
  return app.inject({ method: 'POST', url: '/demo/session' })
}

describe('POST /demo/session', () => {
  it('DEMO_ACTIVEE éteint : 404, sans lire la base', async () => {
    const res = await demarrer(false, {} as never)
    expect(res.statusCode).toBe(404)
  })

  it('aucune organisation de démo : 404', async () => {
    expect((await demarrer(true, prismaDemo({ org: false }))).statusCode).toBe(404)
  })

  it('organisation de démo sans compte ADMIN actif : 404', async () => {
    expect((await demarrer(true, prismaDemo({ compte: false }))).statusCode).toBe(404)
  })

  it('démo disponible : jeton demo, aucun cookie posé, profil de session', async () => {
    const res = await demarrer(true)
    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeUndefined()
    const body = res.json()
    expect(body.user).toEqual({
      id: 'u-demo',
      email: 'president@demo.nkoni.local',
      role: 'ADMIN',
      langue: 'FR',
      devise: 'FCFA',
      nomOrganisation: 'Association Exemple NKONI',
    })
    const decode = app!.jwt.decode<{ sub: string; demo?: boolean; organisationId?: string; role: string }>(body.accessToken)
    expect(decode).toMatchObject({ sub: 'u-demo', demo: true, organisationId: 'org-demo', role: 'ADMIN' })
  })

  it('le jeton émis est bien refusé en écriture (bout en bout)', async () => {
    const res = await demarrer(true)
    const ecriture = await app!.inject({
      method: 'PATCH',
      url: '/notifications/tout-lu',
      headers: { authorization: `Bearer ${res.json().accessToken}` },
    })
    expect(ecriture.statusCode).toBe(403)
  })
})
