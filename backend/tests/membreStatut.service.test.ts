import { describe, it, expect } from 'vitest'
import {
  calculerStatutsMembres,
  calculerStatutsMembresPage,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async ({ where }: any = {}) => (where?.compteUtilisateurId ? 1 : membres.length),
    },
  }
  return prisma
}

describe('calculerStatutsMembres (bulk, §4.1)', () => {
  it('associe à chaque membre son statut de cotisation + les totaux', async () => {
    const res = await calculerStatutsMembres(buildMock(), 2025)
    expect(res.total).toBe(3)
    expect(res.tronque).toBe(false)
    expect(res.items.map((m) => [m.id, m.statutCotisation])).toEqual([
      ['m1', 'A_JOUR'],
      ['m2', 'PARTIEL'],
      ['m3', 'NON_A_JOUR'],
    ])
    expect(res.items[0]).toMatchObject({
      nom: 'Tchoupa',
      branche: { id: 'b1', nom: 'Branche Nord' },
      totalAttenduCumule: 20_000,
      totalValoriseCumule: 20_000,
    })
    // Membre sans branche → branche null.
    expect(res.items[1].branche).toBeNull()
  })

  it('propage le filtre `where` (restriction MEMBRE_SIMPLE)', async () => {
    const capture: { where?: unknown } = {}
    const res = await calculerStatutsMembres(buildMock(capture), 2025, {
      compteUtilisateurId: 'u-simple',
    })
    expect(capture.where).toEqual({ compteUtilisateurId: 'u-simple' })
    expect(res.items).toHaveLength(1)
    expect(res.items[0].id).toBe('m1')
  })

  it('borne la liste à `limite` et signale la troncature', async () => {
    const res = await calculerStatutsMembres(buildMock(), 2025, undefined, 2)
    // Le mock findMany ne coupe pas, mais total (3) > limite (2) → tronque = true.
    expect(res.total).toBe(3)
    expect(res.tronque).toBe(true)
  })
})

describe('calculerStatutsMembresPage (pagination réelle §1.3)', () => {
  it('pagine : page 1 (taille 2) → 2 items, total réel, resume + branches sur TOUT', async () => {
    const res = await calculerStatutsMembresPage(buildMock(), 2025, { page: 1, pageSize: 2 })
    expect(res.items.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(res.total).toBe(3)
    expect(res.page).toBe(1)
    // Resume sur l'ensemble NON filtré : actifs = m1,m2 ; aJour = m1 ; nonAJour parmi actifs = 0 ;
    // inactifs = m3 (DECEDE).
    expect(res.resume).toEqual({ total: 3, actifs: 2, aJour: 1, nonAJour: 0, inactifs: 1 })
    // Branches présentes (b1 via m1/m3) — uniques, triées.
    expect(res.branches).toEqual([{ id: 'b1', nom: 'Branche Nord' }])
  })

  it('page 2 (taille 2) → le reliquat (m3)', async () => {
    const res = await calculerStatutsMembresPage(buildMock(), 2025, { page: 2, pageSize: 2 })
    expect(res.items.map((m) => m.id)).toEqual(['m3'])
    expect(res.total).toBe(3)
  })

  it('filtre par statut de cotisation (calculé) → total filtré, mais resume reste sur TOUT', async () => {
    const res = await calculerStatutsMembresPage(buildMock(), 2025, {
      page: 1,
      pageSize: 25,
      filtreCotisation: 'NON_A_JOUR',
    })
    expect(res.items.map((m) => m.id)).toEqual(['m3'])
    expect(res.total).toBe(1)
    expect(res.resume.total).toBe(3) // synthèse inchangée par le filtre
  })

  it('recherche nom/prénom (insensible à la casse)', async () => {
    const res = await calculerStatutsMembresPage(buildMock(), 2025, {
      page: 1,
      pageSize: 25,
      recherche: 'WAMBA',
    })
    expect(res.items.map((m) => m.id)).toEqual(['m2'])
    expect(res.total).toBe(1)
  })

  it('tri par cotisation asc puis desc (sur le statut calculé)', async () => {
    const asc = await calculerStatutsMembresPage(buildMock(), 2025, {
      page: 1,
      pageSize: 25,
      triCol: 'cotisation',
      triDir: 'asc',
    })
    expect(asc.items.map((m) => m.statutCotisation)).toEqual(['A_JOUR', 'PARTIEL', 'NON_A_JOUR'])
    const desc = await calculerStatutsMembresPage(buildMock(), 2025, {
      page: 1,
      pageSize: 25,
      triCol: 'cotisation',
      triDir: 'desc',
    })
    expect(desc.items.map((m) => m.statutCotisation)).toEqual(['NON_A_JOUR', 'PARTIEL', 'A_JOUR'])
  })

  it('propage le scope MEMBRE_SIMPLE (where) → seule sa fiche', async () => {
    const res = await calculerStatutsMembresPage(buildMock(), 2025, {
      page: 1,
      pageSize: 25,
      where: { compteUtilisateurId: 'u-simple' },
    })
    expect(res.items.map((m) => m.id)).toEqual(['m1'])
    expect(res.total).toBe(1)
  })
})
