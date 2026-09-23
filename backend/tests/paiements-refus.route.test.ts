import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * REFUS MÉTIER de `POST /moi/paiements` — le statut ET le message rendus au membre.
 *
 * Écrit AVANT la migration de la grappe vers `ErreurMetier` (ADR-0001), et c'est la raison d'être
 * de ce fichier : `paiements.route.test.ts` ne couvrait que l'auth et le webhook, donc un sabotage
 * du gestionnaire d'erreur global n'y faisait rien tomber. Sans ces cas, déplacer le mappage HTTP
 * de la route vers la classe d'erreur n'aurait été prouvé par rien.
 *
 * Ils verrouillent le CONTRAT observable — code et message traduit — et pas le chemin qui l'a
 * produit : c'est ce qui leur permet de rester verts, sans modification, de part et d'autre de la
 * migration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const auth = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1', langue: 'FR' })}`,
})

/**
 * Socle minimal pour ATTEINDRE le service : une fiche membre, une organisation dont le forfait
 * inclut le paiement en ligne. Chaque cas ne surcharge ensuite que ce qui doit échouer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socle = (sur: Record<string, any> = {}): any => ({
  membre: {
    findFirst: async ({ select }: { select?: Record<string, boolean> }) =>
      select?.['telephone'] ? { telephone: '237600000000' } : { id: 'm1' },
  },
  organisation: {
    findUnique: async () => ({ forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: true }),
  },
  parametrePaiement: { findFirst: async () => ({ actif: true, provider: 'FAPSHI' }) },
  contribution: { findFirst: async () => ({ id: 'c1', montantAttendu: 50000, montantValorise: 0 }) },
  ...sur,
})

const demarrer = (app: FastifyInstance, montant = 12000) =>
  app.inject({
    method: 'POST',
    url: '/moi/paiements',
    headers: auth(app),
    payload: { contributionId: 'c1', montant },
  })

describe('POST /moi/paiements — refus métier', () => {
  it('paiement en ligne non configuré → 409 et message traduit', async () => {
    const app = await appAvec(socle({ parametrePaiement: { findFirst: async () => null } }))
    const res = await demarrer(app)
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBeTruthy()
    // Le message TECHNIQUE de l'erreur ne doit jamais sortir.
    expect(res.json().message).not.toMatch(/Error|undefined/)
    await app.close()
  })

  it('configuration présente mais INACTIVE → 409 aussi', async () => {
    const app = await appAvec(socle({
      parametrePaiement: { findFirst: async () => ({ actif: false, provider: 'FAPSHI' }) },
    }))
    expect((await demarrer(app)).statusCode).toBe(409)
    await app.close()
  })

  it('contribution inconnue (ou d’un autre membre) → 404', async () => {
    // Le service filtre sur `membreId` : une contribution d'autrui est INTROUVABLE, pas interdite —
    // pas de fuite d'existence.
    const app = await appAvec(socle({ contribution: { findFirst: async () => null } }))
    const res = await demarrer(app)
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })

  it('montant supérieur au reste dû → 400, le plafond est SERVEUR', async () => {
    // Ne jamais se fier au montant du client : sans ce refus, une requête forgée sur-paierait.
    const app = await appAvec(socle({
      contribution: { findFirst: async () => ({ id: 'c1', montantAttendu: 50000, montantValorise: 45000 }) },
    }))
    const res = await demarrer(app, 12000) // reste dû = 5 000
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })

  it('collecte directe (CamPay) sans téléphone exploitable → 400, jamais un 500 du PSP', async () => {
    const app = await appAvec(socle({
      parametrePaiement: { findFirst: async () => ({ actif: true, provider: 'CAMPAY' }) },
      membre: {
        findFirst: async ({ select }: { select?: Record<string, boolean> }) =>
          select?.['telephone'] ? { telephone: null } : { id: 'm1' },
      },
    }))
    expect((await demarrer(app)).statusCode).toBe(400)
    await app.close()
  })
})
