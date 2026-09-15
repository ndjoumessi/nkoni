import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Spec 2026-09-15 §1.7 : l'organisation de démonstration est gérée par la régénération, jamais par la
 * console. Toute action plateforme sur elle → 409, AVANT d'atteindre la moindre écriture ; la liste la
 * renvoie avec `estDemo` pour que la console l'affiche à part.
 */

const DEMO = { id: 'org-demo', nom: 'Association Exemple NKONI', estDemo: true, actif: true, forfait: 'PRO' }
let ecritures: string[] = []

describe('console plateforme — organisation de démonstration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const interdit = (nom: string) => async () => {
      ecritures.push(nom)
      throw new Error(`${nom} ne doit pas être appelé`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      organisation: {
        findUnique: async () => ({ ...DEMO }),
        findMany: async () => [{ ...DEMO, devise: 'FCFA', langueDefaut: 'FR', forfaitExpireLe: null, createdAt: new Date('2026-09-01') }],
        update: interdit('organisation.update'),
        updateMany: interdit('organisation.updateMany'),
      },
      membre: { groupBy: async () => [] },
      platformAuditLog: { create: interdit('platformAuditLog.create') },
      utilisateur: { findUnique: async () => ({ email: 'ops@nkoni.local' }) },
      $transaction: interdit('$transaction'),
    }
    app = await buildApp({ prisma, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const superAdmin = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'sa', role: 'SUPER_ADMIN' })}` })

  it('la liste expose estDemo', async () => {
    const res = await app.inject({ method: 'GET', url: '/platform/organisations', headers: superAdmin() })
    expect(res.statusCode).toBe(200)
    expect(res.json().organisations[0].estDemo).toBe(true)
  })

  it.each([
    ['POST', '/platform/organisations/org-demo/suspendre', undefined],
    ['POST', '/platform/organisations/org-demo/reactiver', undefined],
    ['GET', '/platform/organisations/org-demo/export', undefined],
    ['DELETE', '/platform/organisations/org-demo', { confirmationNom: 'Association Exemple NKONI' }],
    ['PATCH', '/platform/organisations/org-demo/forfait', { forfait: 'GRATUIT' }],
    ['POST', '/platform/organisations/org-demo/forfait/prolonger', { mois: 1, apercu: true }],
  ] as const)('%s %s : 409, aucune écriture', async (method, url, payload) => {
    ecritures = []
    const res = await app.inject({ method, url, headers: superAdmin(), ...(payload ? { payload } : {}) })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('démonstration')
    expect(ecritures).toEqual([])
  })
})
