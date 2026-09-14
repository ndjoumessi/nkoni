/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/** Paiement en ligne selon le forfait (spec 1.1 §3.3). Mocks : aucune base. */

const GRATUIT = { forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }
const GRATUIT_ACQUIS = { ...GRATUIT, paiementEnLigneAcquis: true }
const PRO = { forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: false }

async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}
const jeton = (app: FastifyInstance, role: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role, organisationId: 'org-1' })}`,
})

describe('GET /moi/paiement-disponible', () => {
  const prisma = (org: any, actif = true): any => ({
    organisation: { findUnique: async () => org },
    parametrePaiement: { findFirst: async () => ({ actif }) },
  })

  it.each([
    ['GRATUIT sans droit acquis', GRATUIT, false],
    ['GRATUIT avec droit acquis', GRATUIT_ACQUIS, true],
    ['PRO', PRO, true],
  ])('%s, config active → actif %s', async (_nom, org, attendu) => {
    const app = await appAvec(prisma(org))
    const res = await app.inject({ method: 'GET', url: '/moi/paiement-disponible', headers: jeton(app, 'MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(200)
    expect(res.json().actif).toBe(attendu)
    await app.close()
  })

  it('PRO mais config inactive → actif false', async () => {
    const app = await appAvec(prisma(PRO, false))
    const res = await app.inject({ method: 'GET', url: '/moi/paiement-disponible', headers: jeton(app, 'MEMBRE_SIMPLE') })
    expect(res.json().actif).toBe(false)
    await app.close()
  })
})

describe('POST /moi/paiements — démarrage réservé', () => {
  it('GRATUIT sans droit acquis → 403 paiement.reserveForfaitPro, rien n’est démarré', async () => {
    let contributionLue = false
    const app = await appAvec({
      membre: { findFirst: async () => ({ id: 'm1' }) },
      organisation: { findUnique: async () => GRATUIT },
      contribution: { findFirst: async () => { contributionLue = true; return null }, findUnique: async () => { contributionLue = true; return null } },
    })
    const res = await app.inject({
      method: 'POST', url: '/moi/paiements', headers: jeton(app, 'MEMBRE_SIMPLE'),
      payload: { contributionId: 'c1', montant: 12000 },
    })
    expect(res.statusCode).toBe(403)
    expect(contributionLue).toBe(false)
    await app.close()
  })
})

describe('PUT /organisations/moi/paiement — configuration réservée', () => {
  const corps = { provider: 'FAPSHI', identifiants: { apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' }, actif: true }

  it('GRATUIT sans droit acquis → 403, rien n’est écrit', async () => {
    let ecrit = false
    const app = await appAvec({
      organisation: { findUnique: async () => GRATUIT },
      parametrePaiement: { upsert: async () => { ecrit = true; return {} }, findUnique: async () => null, findFirst: async () => null },
    })
    const res = await app.inject({ method: 'PUT', url: '/organisations/moi/paiement', headers: jeton(app, 'ADMIN'), payload: corps })
    expect(res.statusCode).toBe(403)
    expect(ecrit).toBe(false)
    await app.close()
  })

  it('GRATUIT avec droit acquis → la configuration n’est pas refusée par le forfait', async () => {
    const app = await appAvec({
      organisation: { findUnique: async () => GRATUIT_ACQUIS },
      parametrePaiement: { upsert: async () => ({}), findUnique: async () => null, findFirst: async () => null },
    })
    const res = await app.inject({ method: 'PUT', url: '/organisations/moi/paiement', headers: jeton(app, 'ADMIN'), payload: corps })
    expect(res.statusCode).not.toBe(403)
    await app.close()
  })
})
