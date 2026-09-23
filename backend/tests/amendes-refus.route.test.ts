import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * REFUS MÉTIER des flux d'argent d'une amende — le statut ET le message rendus à l'encaisseur.
 *
 * Écrit AVANT la migration de la grappe vers `ErreurMetier` (ADR-0001) : `amendes.route.ts`
 * n'avait AUCUN fichier de test, donc neutraliser son mappage HTTP ne faisait rien tomber.
 * Déplacer le statut sur la classe n'aurait été prouvé par rien.
 *
 * Ces cas verrouillent le CONTRAT observable — code et message — et non le chemin qui l'a produit :
 * c'est ce qui leur permet de rester verts, sans modification, de part et d'autre de la migration.
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

/** Une amende dans l'état demandé ; `null` pour une amende inexistante. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socle = (statut: string | null): any => ({
  amende: {
    findUnique: async () => (statut === null ? null : { id: 'a1', statut, montant: 5000 }),
    update: async () => ({ id: 'a1', statut: 'PAYEE' }),
  },
})

const appel = (app: FastifyInstance, action: 'payer' | 'annuler') =>
  app.inject({
    method: 'POST',
    url: `/amendes/a1/${action}`,
    headers: tresoriere(app),
    payload: {},
  })

describe('flux d’argent d’une amende — refus métier', () => {
  it('encaisser une amende DÉJÀ payée → 409 et message traduit', async () => {
    // PAYEE est un état terminal : ré-encaisser doublerait la recette.
    const app = await appAvec(socle('PAYEE'))
    const res = await appel(app, 'payer')
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBeTruthy()
    // Le message TECHNIQUE de l'erreur ne doit jamais sortir.
    expect(res.json().message).not.toMatch(/Error|undefined|PAYEE/)
    await app.close()
  })

  it('annuler une amende déjà ANNULEE → 409', async () => {
    const app = await appAvec(socle('ANNULEE'))
    const res = await appel(app, 'annuler')
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })

  it('annuler une amende PAYEE → 409 : l’argent est encaissé, on ne la lève plus', async () => {
    const app = await appAvec(socle('PAYEE'))
    expect((await appel(app, 'annuler')).statusCode).toBe(409)
    await app.close()
  })

  it('amende inconnue → 404, distinct du refus de transition', async () => {
    const app = await appAvec(socle(null))
    const res = await appel(app, 'payer')
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })

  it('transition LÉGITIME : une amende IMPAYEE s’encaisse (200)', async () => {
    // Cas passant — sans lui, les quatre refus ci-dessus seraient verts même si la route
    // refusait TOUT.
    const app = await appAvec(socle('IMPAYEE'))
    expect((await appel(app, 'payer')).statusCode).toBe(200)
    await app.close()
  })
})
