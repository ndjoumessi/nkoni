import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { avecIsolation } from './support/isolation-de-test'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ISOLATION MULTI-TENANT PROUVÉE À TRAVERS UNE ROUTE, SANS BASE DE DONNÉES.
 *
 * C'est ce que le déplacement du seam (revue d'architecture, candidat 5) rend possible. Jusqu'ici
 * l'alternative était binaire : soit un test de route avec un mock — qui, injecté SOUS les
 * extensions de `lib/prisma.ts`, retirait l'isolation du système testé — soit un test
 * d'intégration contre une vraie Postgres, lent et réservé à la CI.
 *
 * La mesure qui motive ce fichier : neutraliser entièrement `intercepterTenant` ne fait tomber
 * AUCUN des ~1 200 tests unitaires hors des deux fichiers qui testent l'extension directement.
 * Les tests de route ne l'exerçaient pas — et leurs docblocks le disaient honnêtement
 * (« l'isolation tenant réelle est prouvée ailleurs »). Ils peuvent désormais l'exercer.
 *
 * Ce fichier ne remplace pas les tests d'intégration : eux seuls prouvent le comportement de
 * Postgres (contraintes, P2025, transactions réelles). Il rend la BOUCLE plus courte pour la
 * question « cette route fuit-elle entre organisations ? ».
 */

const auth = (app: FastifyInstance, organisationId: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'TRESORIERE', organisationId, langue: 'FR' })}`,
})

/** Deux dépenses, deux organisations. Le mock ne filtre RIEN : c'est l'extension qui doit le faire. */
function mockDeuxOrgs() {
  const lignes: any[] = [
    { id: 'd-org1', organisationId: 'org-1', montant: 10_000, date: new Date('2026-05-01'), description: 'Mienne', categorie: 'AUTRE', statut: 'APPROUVEE', saisiParId: 'u1' },
    { id: 'd-org2', organisationId: 'org-2', montant: 99_000, date: new Date('2026-05-02'), description: 'Autrui', categorie: 'AUTRE', statut: 'APPROUVEE', saisiParId: 'u9' },
  ]
  return {
    depense: {
      // Aucun filtrage volontaire : `where.organisationId` est appliqué ici SEULEMENT parce que
      // l'extension l'a injecté. Si elle ne le faisait pas, les deux lignes sortiraient.
      findMany: async ({ where }: any) =>
        lignes.filter((l) => (where?.organisationId ? l.organisationId === where.organisationId : true)),
      findUnique: async ({ where }: any) => lignes.find((l) => l.id === where.id) ?? null,
      count: async ({ where }: any) =>
        lignes.filter((l) => (where?.organisationId ? l.organisationId === where.organisationId : true)).length,
      aggregate: async () => ({ _sum: { montant: 0 } }),
      groupBy: async () => [],
    },
    versement: { aggregate: async () => ({ _sum: { montant: 0 } }), groupBy: async () => [] },
  }
}

async function app(): Promise<FastifyInstance> {
  const a = await buildApp({ prisma: avecIsolation(mockDeuxOrgs()) as any, logger: false })
  await a.ready()
  return a
}

describe('isolation à travers une route, avec la VRAIE extension', () => {
  it('GET /depenses ne rend QUE les dépenses de l’organisation du jeton', async () => {
    const a = await app()
    const res = await a.inject({ method: 'GET', url: '/depenses', headers: auth(a, 'org-1') })
    expect(res.statusCode).toBe(200)
    const items = res.json().items
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('d-org1')
    await a.close()
  })

  it('le MÊME mock, vu depuis l’autre organisation, rend l’autre ligne', async () => {
    // Le mock est identique : c'est le seul contexte d'organisation qui change. Si l'extension
    // était absente, les deux cas renverraient DEUX lignes et ce test échouerait.
    const a = await app()
    const res = await a.inject({ method: 'GET', url: '/depenses', headers: auth(a, 'org-2') })
    expect(res.json().items).toHaveLength(1)
    expect(res.json().items[0].id).toBe('d-org2')
    await a.close()
  })

  it('GET /depenses/:id sur la dépense d’une AUTRE organisation → 404, pas 200', async () => {
    // Le post-filtre de `findUnique` : le mock rend la ligne (il ne connaît pas les orgs),
    // l'extension la change en `null`, la route rend 404. Aucune fuite d'existence.
    const a = await app()
    const res = await a.inject({ method: 'GET', url: '/depenses/d-org2', headers: auth(a, 'org-1') })
    expect(res.statusCode).toBe(404)
    await a.close()
  })

  it('GET /depenses/:id sur la sienne → 200', async () => {
    const a = await app()
    const res = await a.inject({ method: 'GET', url: '/depenses/d-org1', headers: auth(a, 'org-1') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'd-org1' })
    await a.close()
  })
})
