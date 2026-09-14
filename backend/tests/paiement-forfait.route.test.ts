/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { t } from '../src/lib/i18n'

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
    expect(res.statusCode).toBe(200)
    expect(res.json().actif).toBe(false)
    await app.close()
  })
})

describe('POST /moi/paiements — démarrage réservé', () => {
  it('GRATUIT sans droit acquis → 403 NEUTRE (paiement.nonConfigure), rien n’est démarré', async () => {
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
    // Message NEUTRE, pas le discours commercial : un MEMBRE_SIMPLE ne voit jamais
    // « paiement.reserveForfaitPro » (spec 1.1 §1.1, réservé au bureau sur le PUT de config).
    expect(res.json().message).toBe(t('FR', 'paiement.nonConfigure'))
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
    expect(res.json().message).toBe(t('FR', 'paiement.reserveForfaitPro'))
    expect(ecrit).toBe(false)
    await app.close()
  })

  it('GRATUIT avec droit acquis → la configuration n’est pas refusée par le forfait', async () => {
    const app = await appAvec({
      organisation: { findUnique: async () => GRATUIT_ACQUIS },
      parametrePaiement: { upsert: async () => ({}), findUnique: async () => null, findFirst: async () => null },
    })
    const res = await app.inject({ method: 'PUT', url: '/organisations/moi/paiement', headers: jeton(app, 'ADMIN'), payload: corps })
    // Le droit acquis passe la garde du FORFAIT : la porte suivante (chiffrement PSP, indépendant
    // du forfait — `PSP_ENCRYPTION_KEY` absent en test) renvoie 503, jamais le refus 403 commercial.
    // `not.toBe(403)` seul laissait passer un 500 (régression silencieuse) ; on fixe le code ET on
    // vérifie que ce n'est pas le message commercial réservé au forfait Gratuit sans droit acquis.
    expect(res.statusCode).toBe(503)
    expect(res.json().message).not.toBe(t('FR', 'paiement.reserveForfaitPro'))
    await app.close()
  })
})
