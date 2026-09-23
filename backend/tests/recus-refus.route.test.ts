import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * REFUS MÉTIER de la génération et de l'annulation d'un reçu.
 *
 * Écrit AVANT la migration vers `ErreurMetier` (ADR-0001) : `recus.route.test.ts` ne retenait
 * qu'UN des quatre refus (versement inexistant). Les trois autres — reçu actif existant, reçu
 * inconnu, reçu déjà annulé — n'étaient prouvés par rien.
 *
 * Ce qui se joue ici est comptable : un reçu porte un NUMÉRO séquentiel et a pu être remis au
 * membre. Deux reçus actifs pour un même versement, ou une double annulation, casseraient la
 * numérotation ou la trace.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const tresoriere = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'TRESORIERE', organisationId: 'org-1', langue: 'FR' })}`,
})

describe('génération d’un reçu — refus métier', () => {
  it('un reçu ACTIF existe déjà pour ce versement → 409', async () => {
    // Contrôle DANS la transaction : un second reçu actif ferait circuler deux preuves du même
    // versement, chacune avec son numéro.
    const app = await appAvec({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: async (fn: any) =>
        fn({
          versement: {
            findUnique: async () => ({
              id: 'v1',
              montant: 10000,
              dateVersement: new Date(),
              mode: 'ESPECES',
              contribution: { membreId: 'm1', annee: 2026 },
            }),
          },
          recu: { findFirst: async () => ({ numero: 'REC-2026-000001' }) },
        }),
    })
    const res = await app.inject({
      method: 'POST',
      url: '/versements/v1/recu',
      headers: tresoriere(app),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBeTruthy()
    expect(res.json().message).not.toMatch(/Error|undefined/)
    await app.close()
  })

  it('versement inexistant → 404, pas de fuite d’existence', async () => {
    const app = await appAvec({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: async (fn: any) =>
        fn({ versement: { findUnique: async () => null }, recu: { findFirst: async () => null } }),
    })
    const res = await app.inject({
      method: 'POST',
      url: '/versements/inconnu/recu',
      headers: tresoriere(app),
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})

describe('annulation d’un reçu — refus métier', () => {
  const annuler = (app: FastifyInstance) =>
    app.inject({
      method: 'POST',
      url: '/recus/r1/annuler',
      headers: tresoriere(app),
      payload: { motif: 'erreur de saisie' },
    })

  it('reçu inconnu → 404', async () => {
    const app = await appAvec({
      recu: { findUnique: async () => null },
    })
    expect((await annuler(app)).statusCode).toBe(404)
    await app.close()
  })

  it('reçu DÉJÀ annulé → 409 : l’annulation n’est pas rejouable', async () => {
    const app = await appAvec({
      recu: {
        findUnique: async () => ({ id: 'r1', numero: 'REC-2026-000001', annuleLe: new Date() }),
      },
    })
    const res = await annuler(app)
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })
})
