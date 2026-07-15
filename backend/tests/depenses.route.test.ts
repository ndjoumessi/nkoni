import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Trésorerie / dépenses (§5) — permissions par rôle, workflow d'approbation, transitions
 * invalides, solde. Prisma mocké (l'isolation tenant réelle est prouvée ailleurs).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMock() {
  const store = new Map<string, any>([
    ['d1', { id: 'd1', montant: 10_000, date: new Date('2026-05-01'), description: 'Aide', categorie: 'AIDE_MEMBRE', statut: 'EN_ATTENTE', saisiParId: 'u1' }],
    ['d2', { id: 'd2', montant: 5_000, date: new Date('2026-05-02'), description: 'Brouillon', categorie: 'AUTRE', statut: 'BROUILLON', saisiParId: 'u1' }],
    ['d3', { id: 'd3', montant: 8_000, date: new Date('2026-05-03'), description: 'Approuvée', categorie: 'EVENEMENT', statut: 'APPROUVEE', saisiParId: 'u1' }],
  ])
  let seq = 0
  const prisma: any = {
    depense: {
      findUnique: async ({ where }: any) => store.get(where.id) ?? null,
      findMany: async ({ where, skip = 0, take }: any) => {
        const filtres = [...store.values()].filter((d) => (where?.statut ? d.statut === where.statut : true))
        return take != null ? filtres.slice(skip, skip + take) : filtres
      },
      count: async ({ where }: any = {}) =>
        [...store.values()].filter((d) => (where?.statut ? d.statut === where.statut : true)).length,
      create: async ({ data }: any) => {
        const d = { id: `new-${++seq}`, statut: 'BROUILLON', ...data }
        store.set(d.id, d)
        return d
      },
      update: async ({ where, data }: any) => {
        const d = { ...store.get(where.id), ...data }
        store.set(where.id, d)
        return d
      },
      delete: async ({ where }: any) => {
        store.delete(where.id)
        return {}
      },
      groupBy: async () => [{ categorie: 'AIDE_MEMBRE', _sum: { montant: 10_000 } }],
    },
    versement: { aggregate: async () => ({ _sum: { montant: 100_000 } }) },
  }
  return { prisma, store }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Dépenses — permissions & workflow', () => {
  let app: FastifyInstance
  const auth = (role: string, sub = 'u1') => ({ authorization: `Bearer ${app.jwt.sign({ sub, role })}` })

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock().prisma as any, logger: false })
    await app.ready()
  })
  afterEach(async () => app.close())

  /* --- Pagination (audit m4) --- */
  it('GET /depenses paginé → { items, total, page, pageSize } bornés', async () => {
    const p1 = await app.inject({ method: 'GET', url: '/depenses?page=1&pageSize=2', headers: auth('ADMIN') })
    expect(p1.statusCode).toBe(200)
    expect(p1.json()).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(p1.json().items).toHaveLength(2)

    const p2 = await app.inject({ method: 'GET', url: '/depenses?page=2&pageSize=2', headers: auth('ADMIN') })
    expect(p2.json().items).toHaveLength(1)
  })

  /* --- Permissions --- */
  it('ADMIN crée une dépense → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/depenses', headers: auth('ADMIN'),
      payload: { montant: 12_000, date: '2026-06-01', description: 'Test', categorie: 'FONCTIONNEMENT' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().statut).toBe('BROUILLON')
  })

  it('SECRETAIRE (lecture seule sur Depense) → création refusée (403)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/depenses', headers: auth('SECRETAIRE'),
      payload: { montant: 1_000, date: '2026-06-01', description: 'x' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('GUIDE_RELIGIEUX (absent de la matrice Depense) → lecture refusée (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/depenses', headers: auth('GUIDE_RELIGIEUX') })
    expect(res.statusCode).toBe(403)
  })

  /* --- Workflow --- */
  it('COMMISSAIRE_COMPTES approuve une dépense EN_ATTENTE → 200 APPROUVEE (+ approuvePar)', async () => {
    const res = await app.inject({ method: 'POST', url: '/depenses/d1/approuver', headers: auth('COMMISSAIRE_COMPTES', 'cc') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ statut: 'APPROUVEE', approuveParId: 'cc' })
  })

  it('TRESORIERE ne peut PAS approuver (hors rôles d’approbation) → 403', async () => {
    const res = await app.inject({ method: 'POST', url: '/depenses/d1/approuver', headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(403)
  })

  it('approuver un BROUILLON (transition invalide) → 409', async () => {
    const res = await app.inject({ method: 'POST', url: '/depenses/d2/approuver', headers: auth('PRESIDENT') })
    expect(res.statusCode).toBe(409)
  })

  it('rejeter EN_ATTENTE avec motif → 200 REJETEE', async () => {
    const res = await app.inject({
      method: 'POST', url: '/depenses/d1/rejeter', headers: auth('PRESIDENT'),
      payload: { motifRejet: 'Justificatif manquant' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ statut: 'REJETEE', motifRejet: 'Justificatif manquant' })
  })

  it('TRESORIERE marque une dépense APPROUVEE comme PAYEE → 200 PAYEE', async () => {
    const res = await app.inject({ method: 'POST', url: '/depenses/d3/marquer-payee', headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json().statut).toBe('PAYEE')
  })

  it('COMMISSAIRE_COMPTES ne peut PAS marquer payé (hors rôles paiement) → 403', async () => {
    const res = await app.inject({ method: 'POST', url: '/depenses/d3/marquer-payee', headers: auth('COMMISSAIRE_COMPTES', 'cc') })
    expect(res.statusCode).toBe(403)
  })

  it('éditer une dépense APPROUVEE (non éditable) → 409', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/depenses/d3', headers: auth('TRESORIERE'),
      payload: { montant: 9_999 },
    })
    expect(res.statusCode).toBe(409)
  })

  /* --- Solde --- */
  it('GET /tresorerie → entrées/sorties/solde + ventilation', async () => {
    const res = await app.inject({ method: 'GET', url: '/tresorerie', headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ entrees: 100_000, sorties: 10_000, solde: 90_000 })
  })
})
