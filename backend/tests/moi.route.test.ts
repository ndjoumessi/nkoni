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
        return [{ id: 'r1', date: new Date(), lieu: 'Yaoundé', type: 'ORDINAIRE', statut: 'PLANIFIEE' }]
      },
    },
    presenceReunion: {
      findMany: async ({ where }: any) => {
        calls.presenceWhere = where
        return [{ reunionId: 'r1', statut: 'EXCUSE' }]
      },
    },
    resolution: {
      findMany: async ({ where }: any) => {
        calls.resolutionWhere = where
        return [{ id: 'res1', texte: 'On adopte X', reunion: { date: new Date(), lieu: 'Yaoundé' } }]
      },
    },
    vote: {
      findMany: async ({ where }: any) => {
        calls.voteWhere = where
        return [{ resolutionId: 'res1', sens: 'POUR' }]
      },
    },
    versement: {
      findMany: async ({ where }: any) => {
        calls.versementWhere = where
        return [{ id: 'v1', montant: 4_000 }]
      },
    },
    recu: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) => {
        calls.recuDetailWhere = where
        if (where.id === 'r1' && where.membreId === 'm1') {
          return {
            numero: 'NKONI-2024-000001',
            montant: 4_000,
            annee: 2024,
            mode: 'ESPECES',
            dateVersement: new Date('2024-02-15'),
            dateGeneration: new Date('2024-03-01'),
            annuleLe: null,
            membre: { nom: 'Tchoupa', prenom: 'Bernard' },
            organisation: { nom: 'Famille A' },
          }
        }
        return null
      },
      findMany: async ({ where }: any) => {
        calls.recuWhere = where
        return [
          // Reçu ACTIF, rattaché à un versement.
          {
            id: 'r1',
            numero: 'NKONI-2024-000001',
            dateGeneration: new Date('2024-03-01'),
            montant: 4_000,
            annuleLe: null,
          },
          // Reçu ANNULÉ dont le versement a été SUPPRIMÉ (orphelin) : il doit rester listé —
          // c'est tout l'enjeu du snapshot — mais NON téléchargeable.
          {
            id: 'r2',
            numero: 'NKONI-2024-000002',
            dateGeneration: new Date('2024-04-01'),
            montant: 1_500,
            annuleLe: new Date('2024-05-01'),
          },
        ]
      },
    },
    amende: {
      findMany: async ({ where }: any) => {
        calls.amendeWhere = where
        return membre
          ? [{ id: 'am1', type: 'RETARD_COTISATION', motif: 'Retard', montant: 2_000, dateAmende: new Date('2024-02-01'), statut: 'IMPAYEE', datePaiement: null }]
          : []
      },
    },
    cagnotteEvenement: {
      findMany: async ({ where }: any) => {
        calls.cagnotteWhere = where
        return [{ id: 'cg1', titre: 'Deuil', type: 'DEUIL', objectif: 100_000, dateEvenement: null }]
      },
    },
    donCagnotte: {
      // Agrégation par Postgres : DEUX groupBy — collecte totale (sans membreId), puis MON don
      // (avec membreId). Le mock distingue les deux sur la présence de `where.membreId`, et
      // mémorise les deux `where` pour que le test verrouille le périmètre de chacun.
      groupBy: async ({ where }: any) => {
        calls.donWheres = [...((calls.donWheres as any[]) ?? []), where]
        return where.membreId
          ? [{ cagnotteId: 'cg1', _sum: { montant: 5_000 } }]
          : [{ cagnotteId: 'cg1', _sum: { montant: 8_000 } }]
      },
    },
    participationTontine: {
      findMany: async ({ where }: any) => {
        calls.participationWhere = where
        return [
          {
            parts: 2,
            ordre: 1,
            cycle: {
              numero: 1,
              statut: 'EN_COURS',
              tontine: { nom: 'Femmes', montantBaseMise: 5_000, modeRotation: 'ORDRE_FIXE' },
              tours: [
                { numero: 1, beneficiaireId: 'm1', montantPot: 0, statut: 'A_VENIR', mises: [] },
                { numero: 2, beneficiaireId: 'autre', montantPot: 10_000, statut: 'REVERSE', mises: [{ montant: 10_000 }] },
                // Mise PARTIELLE (2 000 sur 10 000 dus) → ne doit PAS s'afficher « payée ».
                { numero: 3, beneficiaireId: 'autre', montantPot: 0, statut: 'A_VENIR', mises: [{ montant: 2_000 }] },
              ],
            },
          },
        ]
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

  it('GET /moi/recus → SES reçus, lus DIRECTEMENT par membreId (orphelins compris)', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/recus', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      {
        id: 'r1',
        numero: 'NKONI-2024-000001',
        date: '2024-03-01T00:00:00.000Z',
        montant: 4_000,
        annuleLe: null,
        telechargeable: true,
      },
      // L'orphelin reste LISTÉ (sa trace survit au versement supprimé) mais n'est plus
      // téléchargeable : `GET /recus/:id/pdf` refuse un reçu annulé en 409. L'annoncer
      // téléchargeable envoyait le membre au-devant d'une erreur.
      {
        id: 'r2',
        numero: 'NKONI-2024-000002',
        date: '2024-04-01T00:00:00.000Z',
        montant: 1_500,
        annuleLe: '2024-05-01T00:00:00.000Z',
        telechargeable: false,
      },
    ])
    // Plus AUCUN détour par les versements : une seule requête, scopée par membre.
    expect(calls.recuWhere).toEqual({ membreId: 'm1' })
  })

  it('GET /moi/recus/:id → détail du reçu, scopé par membreId', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/recus/r1', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.recuDetailWhere).toEqual({ id: 'r1', membreId: 'm1' })
    expect(res.json()).toMatchObject({
      numero: 'NKONI-2024-000001',
      montant: 4_000,
      annee: 2024,
      mode: 'ESPECES',
      membreNom: 'Tchoupa',
      orgNom: 'Famille A',
    })
  })

  it('GET /moi/recus/:id inconnu (ou d’un autre) → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/recus/zzz', headers: auth() })
    expect(res.statusCode).toBe(404)
  })

  it('GET /moi/contributions → filtré par l’id du membre résolu', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/contributions', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.contributionWhere).toEqual({ membreId: 'm1' })
  })

  it('GET /moi/reunions → réunions à venir (non annulées) + son statut RSVP fusionné', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/reunions', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.reunionWhere).toMatchObject({ statut: { not: 'ANNULEE' } })
    // La présence n'est lue QUE pour le membre résolu par le sub, bornée aux réunions listées.
    expect(calls.presenceWhere).toMatchObject({ membreId: 'm1', reunionId: { in: ['r1'] } })
    const body = res.json()
    expect(body[0]).toMatchObject({ id: 'r1', monStatut: 'EXCUSE' })
  })

  it('GET /moi/resolutions → résolutions ouvertes (dateVote null) + mon vote fusionné', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/resolutions', headers: auth() })
    expect(res.statusCode).toBe(200)
    // Seules les résolutions EXPLICITEMENT mises au vote et non clôturées.
    expect(calls.resolutionWhere).toMatchObject({ ouvertAuVote: true, dateVote: null })
    // Le vote n'est lu QUE pour le membre résolu par le sub, borné aux résolutions listées.
    expect(calls.voteWhere).toMatchObject({ membreId: 'm1', resolutionId: { in: ['res1'] } })
    const body = res.json()
    expect(body[0]).toMatchObject({ id: 'res1', texte: 'On adopte X', monVote: 'POUR' })
  })

  it('GET /moi/amendes → SES amendes, filtrées par membreId', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/amendes', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.amendeWhere).toEqual({ membreId: 'm1' })
    expect(res.json()[0]).toMatchObject({ id: 'am1', statut: 'IMPAYEE', montant: 2_000 })
  })

  it('GET /moi/cagnottes → collecte totale + don personnel (deux groupBy, filtré membreId)', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/cagnottes', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      { id: 'cg1', titre: 'Deuil', type: 'DEUIL', objectif: 100_000, dateEvenement: null, collecteTotal: 8_000, monDon: 5_000 },
    ])
    // On ne remonte QUE les cagnottes ouvertes, et les dons sont bornés aux cagnottes listées.
    // (Sans ces assertions, supprimer le filtre statut ne ferait tomber aucun test — fausse couverture.)
    expect(calls.cagnotteWhere).toEqual({ statut: 'OUVERTE' })
    // Le SECOND agrégat porte `membreId` : c'est lui qui garantit que `monDon` n'est pas la
    // collecte de tout le monde. Sans cette assertion, oublier le filtre passerait inaperçu ici
    // (les deux agrégats rendraient la même valeur et le test ne verrait qu'un total plausible).
    expect(calls.donWheres).toEqual([
      { cagnotteId: { in: ['cg1'] } },
      { cagnotteId: { in: ['cg1'] }, membreId: 'm1' },
    ])
  })

  it('GET /moi/tontines → rang, mise due, et par tour bénéficiaire/mise payée', async () => {
    const res = await app.inject({ method: 'GET', url: '/moi/tontines', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(calls.participationWhere).toEqual({ membreId: 'm1' })
    const body = res.json()
    expect(body[0]).toMatchObject({ tontineNom: 'Femmes', cycleNumero: 1, maParts: 2, monOrdre: 1, miseDue: 10_000 })
    // Tour où JE reçois le pot, rien versé, pot pas encore figé (A_VENIR → null).
    expect(body[0].tours[0]).toEqual({ numero: 1, statut: 'A_VENIR', jeSuisBeneficiaire: true, maMisePayee: false, monMontantMise: 0, montantPot: null })
    // Tour reversé : ma mise COUVRE le dû → payée, le pot RÉEL est figé.
    expect(body[0].tours[1]).toEqual({ numero: 2, statut: 'REVERSE', jeSuisBeneficiaire: false, maMisePayee: true, monMontantMise: 10_000, montantPot: 10_000 })
    // Versement PARTIEL (2 000 < 10 000 dus) → PAS « payée », mais le montant versé est exposé.
    expect(body[0].tours[2]).toEqual({ numero: 3, statut: 'A_VENIR', jeSuisBeneficiaire: false, maMisePayee: false, monMontantMise: 2_000, montantPot: null })
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
    for (const url of ['/moi/contributions', '/moi/reunions', '/moi/recus', '/moi/resolutions', '/moi/amendes', '/moi/cagnottes', '/moi/tontines']) {
      const res = await app.inject({ method: 'GET', url, headers: auth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    }
  })
})
