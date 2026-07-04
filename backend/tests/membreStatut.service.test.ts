import { describe, it, expect } from 'vitest'
import {
  calculerStatutsMembres,
  type MembreStatutPrisma,
} from '../src/services/membreStatut.service'

/**
 * Tests unitaires du calcul EN MASSE des statuts de cotisation par membre (§4.1 réutilisé).
 * Prisma mocké : une requête barèmes + une requête membres, aucun N+1.
 */

const baremes = [
  { annee: 2024, montantAttendu: 10_000 },
  { annee: 2025, montantAttendu: 10_000 },
]

const membres = [
  {
    id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', sexe: 'M', statut: 'ACTIF', telephone: null,
    brancheId: 'b1', branche: { id: 'b1', nom: 'Branche Nord' },
    anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [
      { annee: 2024, montantValorise: 10_000 },
      { annee: 2025, montantValorise: 10_000 },
    ],
  }, // attendu 20000 / valorisé 20000 → A_JOUR
  {
    id: 'm2', nom: 'Wamba', prenom: 'Alice', sexe: 'F', statut: 'ACTIF', telephone: '699',
    brancheId: null, branche: null,
    anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 5_000 }],
  }, // attendu 20000 / valorisé 5000 → PARTIEL
  {
    id: 'm3', nom: 'Zé', prenom: 'Paul', sexe: null, statut: 'DECEDE', telephone: null,
    brancheId: 'b1', branche: { id: 'b1', nom: 'Branche Nord' },
    anneeAdhesion: 2024, anneeFinContribution: 2024,
    contributions: [], // borne 2024..2024, attendu 10000, valorisé 0 → NON_A_JOUR
  },
]

function buildMock(capture?: { where?: unknown }) {
  const prisma: MembreStatutPrisma = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any = {}) => {
        if (capture) capture.where = where
        let res = membres
        if (where?.compteUtilisateurId) {
          // Le mock ne modélise pas le compte ; on renvoie m1 pour simuler « sa fiche ».
          res = membres.filter((m) => m.id === 'm1')
        }
        return res
      },
    },
  }
  return prisma
}

describe('calculerStatutsMembres (bulk, §4.1)', () => {
  it('associe à chaque membre son statut de cotisation + les totaux', async () => {
    const res = await calculerStatutsMembres(buildMock(), 2025)
    expect(res.map((m) => [m.id, m.statutCotisation])).toEqual([
      ['m1', 'A_JOUR'],
      ['m2', 'PARTIEL'],
      ['m3', 'NON_A_JOUR'],
    ])
    expect(res[0]).toMatchObject({
      nom: 'Tchoupa',
      branche: { id: 'b1', nom: 'Branche Nord' },
      totalAttenduCumule: 20_000,
      totalValoriseCumule: 20_000,
    })
    // Membre sans branche → branche null.
    expect(res[1].branche).toBeNull()
  })

  it('propage le filtre `where` (restriction MEMBRE_SIMPLE)', async () => {
    const capture: { where?: unknown } = {}
    const res = await calculerStatutsMembres(buildMock(capture), 2025, {
      compteUtilisateurId: 'u-simple',
    })
    expect(capture.where).toEqual({ compteUtilisateurId: 'u-simple' })
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('m1')
  })
})
