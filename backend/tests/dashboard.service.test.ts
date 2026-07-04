import { describe, it, expect } from 'vitest'
import {
  agregerFinances,
  compterParStatutMembre,
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
