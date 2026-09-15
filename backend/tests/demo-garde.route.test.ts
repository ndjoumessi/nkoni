import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Garde lecture seule d'un jeton de démo, appliqué dans `authenticate` (spec 2026-09-15 §1.4).
 *
 * Prisma est un Proxy qui ENREGISTRE chaque appel : un refus doit survenir AVANT toute lecture ou
 * écriture (`appels` vide), une requête permise doit atteindre la base (`appels` non vide — c'est
 * ce qui distingue « passé le garde » de « refusé ailleurs »). Les corps envoyés sont VALIDES : la
 * validation ajv s'exécute avant les preHandlers, un corps invalide rendrait 400 sans prouver le garde.
 */

let appels: string[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaEspion: any = new Proxy(
  {},
  {
    get: (_cible, modele) =>
      new Proxy(
        {},
        {
          get: (_c, operation) => async () => {
            appels.push(`${String(modele)}.${String(operation)}`)
            return []
          },
        },
      ),
  },
)

describe('authenticate — jeton de démonstration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ prisma: prismaEspion, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    appels = []
  })

  const jeton = (demo: boolean) =>
    app.jwt.sign({
      sub: 'u-demo',
      role: 'ADMIN',
      organisationId: 'org-demo',
      langue: 'FR',
      ...(demo ? { demo: true as const } : {}),
    })
  const requete = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, demo: boolean, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${jeton(demo)}` },
      ...(payload ? { payload } : {}),
    })

  it.each([
    ['DELETE', '/membres/m1', undefined],
    ['POST', '/recus/r1/whatsapp', undefined],
    ['PATCH', '/notifications/tout-lu', undefined],
    ['PATCH', '/auth/me/langue', { langue: 'EN' }],
    ['POST', '/equilibrages', { membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 }],
    // PUT self-service (`/moi/reunions/:id/rsvp`, hors matrice, résolu par `req.user.sub`) : corps
    // VALIDE au sens du schéma ajv (`statut` ∈ STATUTS) — le garde doit refuser avant toute lecture,
    // y compris avant celle du membre appelant.
    ['PUT', '/moi/reunions/r1/rsvp', { statut: 'PRESENT' }],
  ] as const)('%s %s : 403 lecture seule, aucune requête en base', async (method, url, payload) => {
    const res = await requete(method, url, true, payload)
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('lecture seule')
    expect(appels).toEqual([])
  })

  it('GET : la lecture passe le garde et atteint la base', async () => {
    const res = await requete('GET', '/membres/options', true)
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })

  it('POST /equilibrages/simuler : exception permise, atteint le service', async () => {
    const res = await requete('POST', '/equilibrages/simuler', true, { membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 })
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })

  it('jeton ordinaire (sans claim demo) : une écriture n’est pas refusée par ce garde', async () => {
    const res = await requete('PATCH', '/notifications/tout-lu', false)
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })
})
