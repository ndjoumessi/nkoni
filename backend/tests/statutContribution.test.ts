import { describe, it, expect } from 'vitest'
import {
  calculerStatutContribution,
  type BaremeAnnuelInput,
  type ContributionInput,
} from '../src/services/statutContribution'

/**
 * Tests de la fonction pure `calculerStatutContribution` (spec §4.1).
 * Aucun accès DB : on injecte directement barèmes + contributions.
 */

// Helper : barèmes uniformes pour une plage d'années [debut, fin] à un montant donné.
function baremesUniformes(
  debut: number,
  fin: number,
  montant: number,
): BaremeAnnuelInput[] {
  const out: BaremeAnnuelInput[] = []
  for (let annee = debut; annee <= fin; annee++) {
    out.push({ annee, montantAttendu: montant })
  }
  return out
}

describe('calculerStatutContribution (§4.1)', () => {
  // 1. Membre à jour : versé == attendu cumulé (borne du >=).
  it('1. A_JOUR quand le valorisé cumulé >= attendu cumulé', () => {
    const baremes = baremesUniformes(2020, 2023, 10_000) // attendu = 40 000
    const contributions: ContributionInput[] = [
      { annee: 2020, montantValorise: 10_000 },
      { annee: 2021, montantValorise: 10_000 },
      { annee: 2022, montantValorise: 10_000 },
      { annee: 2023, montantValorise: 10_000 },
    ]

    const r = calculerStatutContribution({
      baremes,
      contributions,
      anneeAdhesion: 2020,
      anneeCourante: 2023,
    })

    expect(r.totalAttenduCumule).toBe(40_000)
    expect(r.totalValoriseCumule).toBe(40_000)
    expect(r.statut).toBe('A_JOUR')
  })

  // 2. Membre partiel : 0 < valorisé < attendu.
  it('2. PARTIEL quand 0 < valorisé cumulé < attendu cumulé', () => {
    const baremes = baremesUniformes(2020, 2023, 10_000) // attendu = 40 000
    const contributions: ContributionInput[] = [
      { annee: 2020, montantValorise: 10_000 },
      { annee: 2021, montantValorise: 10_000 },
      { annee: 2022, montantValorise: 5_000 },
    ] // valorisé = 25 000

    const r = calculerStatutContribution({
      baremes,
      contributions,
      anneeAdhesion: 2020,
      anneeCourante: 2023,
    })

    expect(r.totalAttenduCumule).toBe(40_000)
    expect(r.totalValoriseCumule).toBe(25_000)
    expect(r.statut).toBe('PARTIEL')
  })

  // 3. Membre non à jour : rien versé.
  it('3. NON_A_JOUR quand le valorisé cumulé == 0', () => {
    const baremes = baremesUniformes(2020, 2023, 10_000) // attendu = 40 000
    const contributions: ContributionInput[] = [] // valorisé = 0

    const r = calculerStatutContribution({
      baremes,
      contributions,
      anneeAdhesion: 2020,
      anneeCourante: 2023,
    })

    expect(r.totalAttenduCumule).toBe(40_000)
    expect(r.totalValoriseCumule).toBe(0)
    expect(r.statut).toBe('NON_A_JOUR')
  })

  // 4. Membre DECEDE : aucune attente NI valorisation comptée après anneeFinContribution,
  //    même si un BaremeAnnuel existe pour ces années postérieures.
  it("4. DECEDE : aucune attente comptée après anneeFinContribution", () => {
    const baremes = baremesUniformes(2018, 2023, 10_000) // barèmes existent jusqu'en 2023
    const contributions: ContributionInput[] = [
      { annee: 2018, montantValorise: 10_000 },
      { annee: 2019, montantValorise: 10_000 },
      { annee: 2020, montantValorise: 10_000 },
      // Contribution parasite APRÈS le décès : doit être ignorée du cumul valorisé.
      { annee: 2022, montantValorise: 10_000 },
    ]

    const r = calculerStatutContribution({
      baremes,
      contributions,
      anneeAdhesion: 2018,
      anneeFinContribution: 2020, // décédé : fin de contribution en 2020
      anneeCourante: 2023,
    })

    // Seules 2018, 2019, 2020 comptent des deux côtés (2021→2023 exclues).
    expect(r.totalAttenduCumule).toBe(30_000)
    expect(r.totalValoriseCumule).toBe(30_000)
    expect(r.statut).toBe('A_JOUR')
  })

  // 5. Équilibrage simulé : deux répartitions différentes par année, même somme totale
  //    => statut identique. Un équilibrage ne peut pas faire reculer un membre à jour.
  it('5. Équilibrage : répartitions différentes, même total => même statut', () => {
    const baremes = baremesUniformes(2021, 2023, 600) // attendu = 1 800
    const anneeAdhesion = 2021
    const anneeCourante = 2023

    // Avant équilibrage : [500, 500, 1000] (total 2000)
    const avant: ContributionInput[] = [
      { annee: 2021, montantValorise: 500 },
      { annee: 2022, montantValorise: 500 },
      { annee: 2023, montantValorise: 1_000 },
    ]
    // Après équilibrage : [666, 667, 667] (total 2000, inchangé)
    const apres: ContributionInput[] = [
      { annee: 2021, montantValorise: 666 },
      { annee: 2022, montantValorise: 667 },
      { annee: 2023, montantValorise: 667 },
    ]

    const rAvant = calculerStatutContribution({
      baremes,
      contributions: avant,
      anneeAdhesion,
      anneeCourante,
    })
    const rApres = calculerStatutContribution({
      baremes,
      contributions: apres,
      anneeAdhesion,
      anneeCourante,
    })

    // Le total valorisé est conservé...
    expect(rAvant.totalValoriseCumule).toBe(2_000)
    expect(rApres.totalValoriseCumule).toBe(2_000)
    // ...et le statut est strictement identique (A_JOUR avant ET après).
    expect(rAvant.statut).toBe('A_JOUR')
    expect(rApres.statut).toBe(rAvant.statut)
  })

  // 6. Cas limite : le membre vient d'adhérer cette année (adhesion == courante).
  //    Un seul BaremeAnnuel doit être pris en compte.
  it("6. Adhésion l'année courante : un seul barème compté", () => {
    const baremes: BaremeAnnuelInput[] = [
      { annee: 2023, montantAttendu: 10_000 }, // année précédente : hors borne (avant adhésion)
      { annee: 2024, montantAttendu: 12_000 }, // seule année attendue
    ]
    const contributions: ContributionInput[] = [
      { annee: 2024, montantValorise: 12_000 },
    ]

    const r = calculerStatutContribution({
      baremes,
      contributions,
      anneeAdhesion: 2024,
      anneeCourante: 2024,
    })

    expect(r.totalAttenduCumule).toBe(12_000) // pas 22 000 : 2023 exclu
    expect(r.totalValoriseCumule).toBe(12_000)
    expect(r.statut).toBe('A_JOUR')
  })

  // 7. Cas limite : une année du cumul n'a pas encore de BaremeAnnuel configuré.
  //    Comportement décidé : l'année sans barème est IGNORÉE (contribue 0 à l'attendu),
  //    aucune erreur n'est levée. Voir le commentaire dans le service.
  it('7. Année sans barème configuré : ignorée dans le cumul attendu (pas d’erreur)', () => {
    // Barèmes pour 2020 et 2022 seulement ; 2021 n'est pas encore configurée.
    const baremes: BaremeAnnuelInput[] = [
      { annee: 2020, montantAttendu: 10_000 },
      { annee: 2022, montantAttendu: 10_000 },
    ]
    const contributions: ContributionInput[] = [
      { annee: 2020, montantValorise: 10_000 },
      { annee: 2022, montantValorise: 10_000 },
    ]

    const calcul = () =>
      calculerStatutContribution({
        baremes,
        contributions,
        anneeAdhesion: 2020,
        anneeCourante: 2022,
      })

    expect(calcul).not.toThrow()
    const r = calcul()
    // 2021 n'est pas comptée : attendu = 20 000 (et non 30 000).
    expect(r.totalAttenduCumule).toBe(20_000)
    expect(r.totalValoriseCumule).toBe(20_000)
    expect(r.statut).toBe('A_JOUR')
  })
})
