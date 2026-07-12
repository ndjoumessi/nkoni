import { describe, it, expect } from 'vitest'
import {
  agregerFinances,
  compterParStatutMembre,
  construireEvolutionMensuelle,
  anniversairesDuMois,
  calculerDashboardComplet,
  calculerDashboardFinancier,
  type DashboardPrisma,
  type MembreCotisant,
} from '../src/services/dashboard.service'

/**
 * Tests unitaires du dashboard (§5.8) : agrégations pures + alerte « barème manquant »
 * avec `anneeCourante` injectée (déterministe, indépendant de l'horloge). Prisma mocké.
 */

const baremes2024_2025 = [
  { annee: 2024, montantAttendu: 10_000 },
  { annee: 2025, montantAttendu: 10_000 },
]

/** Membres cotisants pour les agrégations : 1 A_JOUR, 1 PARTIEL, 1 NON_A_JOUR. */
const membresCotisants: MembreCotisant[] = [
  {
    anneeAdhesion: 2024,
    anneeFinContribution: null,
    contributions: [
      { annee: 2024, montantValorise: 10_000 },
      { annee: 2025, montantValorise: 10_000 },
    ],
  }, // attendu 20000 / valorisé 20000 → A_JOUR
  {
    anneeAdhesion: 2024,
    anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 10_000 }],
  }, // attendu 20000 / valorisé 10000 → PARTIEL
  {
    anneeAdhesion: 2024,
    anneeFinContribution: null,
    contributions: [],
  }, // attendu 20000 / valorisé 0 → NON_A_JOUR
]

describe('agregerFinances (pure, §5.8)', () => {
  it('additionne attendu/collecté et répartit les statuts sur la même population', () => {
    const fin = agregerFinances(membresCotisants, baremes2024_2025, 2025)
    expect(fin.totalAttenduCumule).toBe(60_000) // 3 × 20000
    expect(fin.totalCollecteCumule).toBe(30_000) // 20000 + 10000 + 0
    expect(fin.tauxRecouvrement).toBe(50) // 30000/60000
    expect(fin.distribution).toEqual({ A_JOUR: 1, PARTIEL: 1, NON_A_JOUR: 1 })
  })

  it('taux = 0 si rien n’est attendu (pas de division par zéro)', () => {
    const fin = agregerFinances([], baremes2024_2025, 2025)
    expect(fin.totalAttenduCumule).toBe(0)
    expect(fin.tauxRecouvrement).toBe(0)
  })
})

describe('construireEvolutionMensuelle (pure, §10)', () => {
  it('renvoie 12 mois ordonnés avec une cible mensuelle = attendu annuel / 12', () => {
    const ev = construireEvolutionMensuelle([], 120_000, 2026)
    expect(ev).toHaveLength(12)
    expect(ev.map((e) => e.mois)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(ev.every((e) => e.attendu === 10_000)).toBe(true) // 120000 / 12
    expect(ev.every((e) => e.collecte === 0)).toBe(true)
  })

  it('ventile le collecté par mois UTC et ignore les versements hors année courante', () => {
    const ev = construireEvolutionMensuelle(
      [
        { montant: 5_000, dateVersement: new Date('2026-01-15T00:00:00Z') },
        { montant: 3_000, dateVersement: new Date('2026-01-20T00:00:00Z') }, // même mois → cumulé
        { montant: 7_000, dateVersement: new Date('2026-03-02T00:00:00Z') },
        { montant: 9_000, dateVersement: new Date('2025-12-31T00:00:00Z') }, // année précédente → ignoré
      ],
      120_000,
      2026,
    )
    expect(ev[0].collecte).toBe(8_000) // janvier : 5000 + 3000
    expect(ev[2].collecte).toBe(7_000) // mars
    expect(ev.reduce((s, e) => s + e.collecte, 0)).toBe(15_000) // le versement 2025 est exclu
  })

  it('ventile aussi le collecté de l’année précédente (collecteN1), N-2 exclu', () => {
    const ev = construireEvolutionMensuelle(
      [{ montant: 5_000, dateVersement: new Date('2026-02-10T00:00:00Z') }],
      120_000,
      2026,
      [
        { montant: 3_000, dateVersement: new Date('2025-02-05T00:00:00Z') }, // fév N-1
        { montant: 1_000, dateVersement: new Date('2024-02-05T00:00:00Z') }, // N-2 → ignoré
      ],
    )
    expect(ev[1].collecte).toBe(5_000) // février N
    expect(ev[1].collecteN1).toBe(3_000) // février N-1
    expect(ev[0].collecteN1).toBe(0)
    expect(ev.reduce((s, e) => s + e.collecteN1, 0)).toBe(3_000) // le versement 2024 est exclu
  })
})

describe('anniversairesDuMois (pure)', () => {
  it('filtre par mois UTC, ignore les membres sans date, trie par jour', () => {
    const r = anniversairesDuMois(
      [
        { id: 'a', nom: 'A', prenom: 'Ana', dateNaissance: new Date('1990-07-20T00:00:00Z') },
        { id: 'b', nom: 'B', prenom: 'Bea', dateNaissance: new Date('1985-07-03T00:00:00Z') },
        { id: 'c', nom: 'C', prenom: 'Cid', dateNaissance: new Date('1980-08-01T00:00:00Z') }, // autre mois
        { id: 'd', nom: 'D', prenom: 'Dan', dateNaissance: null }, // sans date → ignoré
      ],
      7,
    )
    expect(r.map((x) => x.id)).toEqual(['b', 'a']) // triés par jour (3 puis 20)
    expect(r[0].jour).toBe(3)
  })
})

describe('compterParStatutMembre (pure)', () => {
  it('compte ACTIF/INACTIF/DECEDE', () => {
    expect(
      compterParStatutMembre([
        { statut: 'ACTIF' }, { statut: 'ACTIF' }, { statut: 'INACTIF' }, { statut: 'DECEDE' },
      ]),
    ).toEqual({ ACTIF: 2, INACTIF: 1, DECEDE: 1 })
  })
})

/* -------------------------------------------------------------------------- */
/* Alerte « barème année courante manquant »                                  */
/* -------------------------------------------------------------------------- */

function buildMock(baremes: { annee: number; montantAttendu: number }[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      findMany: async () =>
        membresCotisants.map((m, i) => ({ id: `m${i}`, statut: 'ACTIF', ...m })),
      findUnique: async () => null,
    },
    brancheFamiliale: { count: async () => 2 },
    versement: { findMany: async () => [] as { montant: number; dateVersement: Date }[] },
  }
  return prisma as DashboardPrisma
}

describe('alerte barème (§5.8, risque identifié à l’étape 4)', () => {
  it('alerte TRUE quand l’année courante n’a pas de barème', async () => {
    const dash = await calculerDashboardComplet(buildMock(baremes2024_2025), 2026)
    expect(dash.alertes.baremeAnneeCouranteManquant).toBe(true)
  })

  it('alerte FALSE quand l’année courante a un barème', async () => {
    const dash = await calculerDashboardComplet(buildMock(baremes2024_2025), 2025)
    expect(dash.alertes.baremeAnneeCouranteManquant).toBe(false)
  })

  it('la vue FINANCIER porte aussi l’alerte', async () => {
    const dash = await calculerDashboardFinancier(buildMock(baremes2024_2025), 2026)
    expect(dash.alertes.baremeAnneeCouranteManquant).toBe(true)
  })
})
