import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * REFUS MÉTIER de la CLÔTURE d'une cagnotte — le reversement ne peut pas dépasser la collecte.
 *
 * Écrit AVANT la migration vers `ErreurMetier` (ADR-0001) : `cagnottes.route.ts` n'avait aucun
 * fichier de test, donc son mappage HTTP n'était retenu par rien.
 *
 * L'invariant gardé ici est financier : reverser plus que ce qui a été collecté inventerait de
 * l'argent dans les comptes d'une association de transparence financière.
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

/** Une cagnotte ouverte et la somme RÉELLEMENT collectée (agrégat serveur). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socle = (collecte: number, existe = true): any => ({
  cagnotteEvenement: {
    findUnique: async () => (existe ? { id: 'c1', statut: 'OUVERTE', objectif: 100000 } : null),
    update: async () => ({ id: 'c1', statut: 'CLOTUREE' }),
  },
  donCagnotte: {
    aggregate: async () => ({ _sum: { montant: collecte }, _count: { _all: 3 } }),
  },
})

const cloturer = (app: FastifyInstance, montantReverse: number) =>
  app.inject({
    method: 'POST',
    url: '/cagnottes/c1/cloturer',
    headers: tresoriere(app),
    payload: { montantReverse },
  })

describe('clôture d’une cagnotte — refus métier', () => {
  it('reverser PLUS que la collecte → 400 et message traduit', async () => {
    // Le plafond est SERVEUR : il vient de l'agrégat des dons, jamais du corps de la requête.
    const app = await appAvec(socle(50000))
    const res = await cloturer(app, 60000)
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBeTruthy()
    // Le message TECHNIQUE de l'erreur ne doit jamais sortir.
    expect(res.json().message).not.toMatch(/Error|undefined|60000/)
    await app.close()
  })

  it('un montant NÉGATIF est arrêté par le SCHÉMA, avant le service', async () => {
    // Le 400 rendu ici ne vient PAS du refus métier : `montantReverse` est déclaré
    // `{ minimum: 0 }`, donc ajv rejette la requête avant le handler. Le cas est conservé parce
    // qu'il verrouille cette borne — mais il ne prouve rien sur le mappage des erreurs du
    // service, et le confondre avec le cas ci-dessus en ferait un test vacant.
    // Corollaire : la branche `montantReverse < 0` de `validerReversement` est une DEUXIÈME
    // ligne, inatteignable par HTTP tant que le schéma tient. Elle protège les appelants
    // non-HTTP (scripts, tâches de fond).
    const app = await appAvec(socle(50000))
    const res = await cloturer(app, -1)
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/montantReverse/)
    await app.close()
  })

  it('cagnotte inconnue → 404, distinct du refus de montant', async () => {
    const app = await appAvec(socle(50000, false))
    const res = await cloturer(app, 10000)
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBeTruthy()
    await app.close()
  })

  it('reverser EXACTEMENT la collecte passe (200) — la borne est inclusive', async () => {
    // Cas passant : sans lui, les refus ci-dessus resteraient verts même si la route refusait TOUT.
    const app = await appAvec(socle(50000))
    expect((await cloturer(app, 50000)).statusCode).toBe(200)
    await app.close()
  })
})
