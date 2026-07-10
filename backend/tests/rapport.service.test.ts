import { describe, it, expect } from 'vitest'
import {
  genererRapportFinancier,
  comparerPeriodes,
  comparerPeriodesMulti,
  variationPourcent,
  rapportPourAnnee,
  type MembreRapport,
} from '../src/services/rapport.service'
import { calculerStatutContribution } from '../src/services/statutContribution'

/**
 * Tests unitaires des rapports financiers (fonctions PURES, sans base).
 *
 * On vérifie : le calcul par année (attendu/collecté/taux/répartition des statuts), la
 * COHÉRENCE avec `calculerStatutContribution` (le rapport n'invente pas de logique de
 * statut), la variation en % dans les deux sens, et le cas « année sans barème » ignorée.
 */

const baremes = [
  { annee: 2023, montantAttendu: 10_000 },
  { annee: 2024, montantAttendu: 12_000 },
  { annee: 2025, montantAttendu: 15_000 },
  // 2026 : volontairement SANS barème → doit être ignorée.
]

// M1 : adhère 2023, toujours cotisant. 2023 payé plein, 2024 partiel, 2025 payé plein.
const M1: MembreRapport = {
  anneeAdhesion: 2023,
  anneeFinContribution: null,
  contributions: [
    { annee: 2023, montantValorise: 10_000 },
    { annee: 2024, montantValorise: 6_000 },
    { annee: 2025, montantValorise: 15_000 },
  ],
}
// M2 : adhère 2024. 2024 payé plein, 2025 rien.
const M2: MembreRapport = {
  anneeAdhesion: 2024,
  anneeFinContribution: null,
  contributions: [{ annee: 2024, montantValorise: 12_000 }],
}
// M3 : adhère 2023, fin d'obligation 2024 (décédé/inactif). 2023 rien, 2024 payé plein.
const M3: MembreRapport = {
  anneeAdhesion: 2023,
  anneeFinContribution: 2024,
  contributions: [{ annee: 2024, montantValorise: 12_000 }],
}

const membres = [M1, M2, M3]

describe('genererRapportFinancier (pur, par année)', () => {
  const rapport = genererRapportFinancier(2023, 2026, baremes, membres)

  it('produit une ligne par année AYANT un barème (2026 sans barème → ignorée)', () => {
    expect(rapport.annees.map((a) => a.annee)).toEqual([2023, 2024, 2025])
  })

  it('2023 : éligibles M1+M3, attendu 20000, collecté 10000, taux 50, 1 à jour / 1 non à jour', () => {
    const a = rapport.annees.find((x) => x.annee === 2023)!
    expect(a.membresEligibles).toBe(2) // M1, M3 ; M2 pas encore adhérent
    expect(a.totalAttendu).toBe(20_000)
    expect(a.totalCollecte).toBe(10_000)
    expect(a.tauxRecouvrement).toBe(50)
    expect(a.membresParStatut).toEqual({ A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 1 })
  })

  it('2024 : les 3 éligibles, attendu 36000, collecté 30000, taux 83.33, 2 à jour / 1 partiel', () => {
    const a = rapport.annees.find((x) => x.annee === 2024)!
    expect(a.membresEligibles).toBe(3)
    expect(a.totalAttendu).toBe(36_000)
    expect(a.totalCollecte).toBe(30_000)
    expect(a.tauxRecouvrement).toBe(83.33)
    expect(a.membresParStatut).toEqual({ A_JOUR: 2, PARTIEL: 1, NON_A_JOUR: 0 })
  })

  it('2025 : M3 exclu (fin 2024), attendu 30000, collecté 15000, 1 à jour / 1 non à jour', () => {
    const a = rapport.annees.find((x) => x.annee === 2025)!
    expect(a.membresEligibles).toBe(2) // M1, M2 ; M3 hors obligation
    expect(a.totalAttendu).toBe(30_000)
    expect(a.totalCollecte).toBe(15_000)
    expect(a.tauxRecouvrement).toBe(50)
    expect(a.membresParStatut).toEqual({ A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 1 })
  })

  it('plage vide si anneeDebut > anneeFin', () => {
    expect(genererRapportFinancier(2025, 2023, baremes, membres).annees).toEqual([])
  })
})

describe('cohérence avec calculerStatutContribution', () => {
  it('sur un seul membre, Σ attendus/collectés annuels = cumul de la fonction pure', () => {
    // Rapport isolé sur M1 (cotisant 2023→2025).
    const seul = genererRapportFinancier(2023, 2025, baremes, [M1])
    const sommeAttendu = seul.annees.reduce((s, a) => s + a.totalAttendu, 0)
    const sommeCollecte = seul.annees.reduce((s, a) => s + a.totalCollecte, 0)

    // Cumul calculé par la fonction de référence (§4.1) sur la même plage.
    const cumul = calculerStatutContribution({
      baremes,
      contributions: M1.contributions,
      anneeAdhesion: 2023,
      anneeFinContribution: null,
      anneeCourante: 2025,
    })

    expect(sommeAttendu).toBe(cumul.totalAttenduCumule) // 10000+12000+15000
    expect(sommeCollecte).toBe(cumul.totalValoriseCumule) // 10000+6000+15000
  })

  it('rapportPourAnnee renvoie null pour une année sans barème', () => {
    expect(rapportPourAnnee(2026, baremes, membres)).toBeNull()
  })
})

describe('variationPourcent', () => {
  it('progression et régression', () => {
    expect(variationPourcent(100, 150)).toBe(50)
    expect(variationPourcent(150, 100)).toBe(-33.33)
  })

  it('« nouveau » si 0 → positif, 0 si 0 → 0, null seulement si valeur absente (pas de division par zéro)', () => {
    expect(variationPourcent(0, 100)).toBe('nouveau') // apparition (base 0 → positif)
    expect(variationPourcent(0, 0)).toBe(0) // resté à zéro = pas de variation (plus « n/a »)
    expect(variationPourcent(null, 100)).toBeNull() // année sans barème → n/a
    expect(variationPourcent(100, null)).toBeNull()
  })
})

describe('comparerPeriodes (pur)', () => {
  it('progression 2023 → 2024 : variations positives', () => {
    const c = comparerPeriodes(2023, 2024, baremes, membres)
    expect(c.rapportA?.totalCollecte).toBe(10_000)
    expect(c.rapportB?.totalCollecte).toBe(30_000)
    expect(c.variations.totalAttendu).toBe(80) // 20000 → 36000
    expect(c.variations.totalCollecte).toBe(200) // 10000 → 30000
    expect(c.variations.tauxRecouvrement).toBeGreaterThan(0) // 50 → 83.33
  })

  it('régression 2024 → 2025 : variations négatives', () => {
    const c = comparerPeriodes(2024, 2025, baremes, membres)
    expect(c.variations.totalAttendu).toBe(-16.67) // 36000 → 30000
    expect(c.variations.totalCollecte).toBe(-50) // 30000 → 15000
    expect(c.variations.tauxRecouvrement).toBeLessThan(0) // 83.33 → 50
  })

  it('année sans barème → bloc null et variations null, sans erreur', () => {
    const c = comparerPeriodes(2025, 2026, baremes, membres)
    expect(c.rapportA).not.toBeNull()
    expect(c.rapportB).toBeNull()
    expect(c.variations).toEqual({
      totalAttendu: null,
      totalCollecte: null,
      tauxRecouvrement: null,
    })
  })
})

describe('comparerPeriodesMulti (chaîne : chaque année vs la précédente de la liste)', () => {
  it('3 années contiguës : la 1re sans variation, les suivantes vs la précédente', () => {
    const c = comparerPeriodesMulti([2023, 2024, 2025], baremes, membres)
    expect(c.annees.map((a) => a.annee)).toEqual([2023, 2024, 2025])

    // 2023 : première de la liste → aucune variation.
    expect(c.annees[0].variations).toBeNull()
    expect(c.annees[0].rapport?.totalCollecte).toBe(10_000)

    // 2024 vs 2023 : attendu 20000→36000 (+80), collecté 10000→30000 (+200).
    expect(c.annees[1].variations?.totalAttendu).toBe(80)
    expect(c.annees[1].variations?.totalCollecte).toBe(200)

    // 2025 vs 2024 : attendu 36000→30000 (-16.67), collecté 30000→15000 (-50).
    expect(c.annees[2].variations?.totalAttendu).toBe(-16.67)
    expect(c.annees[2].variations?.totalCollecte).toBe(-50)
  })

  it('années NON contiguës : la variation se calcule vs la précédente DANS LA LISTE, pas l’année civile', () => {
    // Liste [2023, 2025] en sautant 2024 : 2025 doit être comparé à 2023 (pas à 2024).
    const c = comparerPeriodesMulti([2023, 2025], baremes, membres)
    // 2025 vs 2023 : attendu 20000→30000 = +50 (et non -16.67 qui serait le vs-2024).
    expect(c.annees[1].variations?.totalAttendu).toBe(50)
    expect(c.annees[1].variations?.totalCollecte).toBe(50) // 10000 → 15000
  })

  it('année sans barème dans la liste : rapport null + variations null, sans erreur', () => {
    const c = comparerPeriodesMulti([2025, 2026], baremes, membres)
    expect(c.annees[1].rapport).toBeNull()
    expect(c.annees[1].variations).toEqual({
      totalAttendu: null,
      totalCollecte: null,
      tauxRecouvrement: null,
    })
  })
})
