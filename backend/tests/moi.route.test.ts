import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Espace membre self-service (§5) — routes /moi/*. Prisma mocké. Vérifie :
 *   - ISOLATION : chaque route résout le Membre via le sub du token et ne lit QUE ses données
 *     (le `where` porte l'id résolu, jamais un id fourni par le client) ;
 *   - état SANS fiche membre liée → /moi/situation = 404, listes = [].
 */

const MEMBRE = {
  id: 'm1',
  nom: 'Tchoupa',
  prenom: 'Bernard',
  statut: 'ACTIF',
  anneeAdhesion: 2024,
  anneeFinContribution: null,
  brancheId: 'b1',
  compteUtilisateurId: 'u1',
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMock(membre: any) {
  const calls: Record<string, any> = {}
  const prisma: any = {
    membre: {
      findFirst: async ({ where }: any) => {
        calls.membreWhere = where
        return membre
      },
    },
    baremeAnnuel: { findMany: async () => [{ annee: 2024, montantAttendu: 10_000 }] },
    contribution: {
      findMany: async ({ where }: any) => {
        calls.contributionWhere = where
        return membre
          ? [{ id: 'c1', annee: 2024, montantAttendu: 10_000, montantVerse: 4_000, montantValorise: 4_000, versements: [] }]
          : []
      },
    },
    brancheFamiliale: { findFirst: async () => ({ nom: 'Nord' }) },
    reunion: {
      findMany: async ({ where }: any) => {
        calls.reunionWhere = where
        return []
      },
    },
    versement: {
      findMany: async ({ where }: any) => {
        calls.versementWhere = where
        return [{ id: 'v1', montant: 4_000 }]
      },
    },
    recu: {
      findMany: async ({ where }: any) => {
        calls.recuWhere = where
        return [{ id: 'r1', numero: 'NKONI-2024-000001', dateGeneration: new Date('2024-03-01'), versementId: 'v1', urlPdf: null }]
      },
    },
  }
  return { prisma, calls }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Espace membre /moi/* — membre lié', () => {
  let app: FastifyInstance
  let calls: Record<string, unknown>
  const auth = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE' })}` })

  beforeAll(async () => {
    const m = buildMock(MEMBRE)
    calls = m.calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: m.prisma as any, logger: false })
    await app.ready()
  })
  afterAll(async () => app.close())

  it('GET /moi/situation → identité + cotisation (dû/versé) du membre du token', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/situation', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      membre: { nom: 'Tchoupa', prenom: 'Bernard', branche: 'Nord', statut: 'ACTIF', anneeAdhesion: 2024 },
      cotisation: { statut: 'PARTIEL', totalDu: 10_000, totalVerse: 4_000 },
    })
    // Isolation : membre résolu par le sub, contributions filtrées par l'id résolu.
    expect(calls.membreWhere).toEqual({ compteUtilisateurId: 'u1' })
    expect(calls.contributionWhere).toEqual({ membreId: 'm1' })
  })

  it('GET /moi/recus → SES reçus (montant du versement), filtrés par ses versements', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/recus', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      { id: 'r1', numero: 'NKONI-2024-000001', date: '2024-03-01T00:00:00.000Z', montant: 4_000, telechargeable: false },
    ])
    expect(calls.versementWhere).toEqual({ contribution: { membreId: 'm1' } })
  })

  it('GET /moi/contributions → filtré par l’id du membre résolu', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/contributions', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.contributionWhere).toEqual({ membreId: 'm1' })
  })

  it('GET /moi/reunions → réunions à venir (non annulées)', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/reunions', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.reunionWhere).toMatchObject({ statut: { not: 'ANNULEE' } })
  })
})

describe('Espace membre /moi/* — compte SANS fiche membre (ex. ADMIN)', () => {
  let app: FastifyInstance
  const auth = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'admin', role: 'ADMIN' })}` })

  beforeAll(async () => {
    const m = buildMock(null) // aucun membre lié
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: m.prisma as any, logger: false })
    await app.ready()
  })
  afterAll(async () => app.close())

  it('GET /moi/situation → 404 propre', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/situation', headers: auth() })
    expect(res.statusCode).toBe(404)
  })

  it('listes → tableaux vides (200)', async () => {
    for (const url of ['/moi/contributions', '/moi/reunions', '/moi/recus']) {
      const res = await app.inject({ method: 'GET', url, headers: auth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    }
  })
})
