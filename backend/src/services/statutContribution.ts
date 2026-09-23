/**
 * Calcul du statut de contribution CUMULATIF — NKONI, section 4.1 de la spec.
 *
 * Fonction PURE : aucun accès Prisma / base de données. Elle reçoit en entrée les
 * données déjà chargées (barèmes annuels + contributions du membre) et retourne le
 * cumul attendu, le cumul valorisé et le statut dérivé. Elle est donc testable
 * isolément, sans DB.
 *
 * Principe (spec §4.1) :
 *   borneFin            = min(anneeCourante, anneeFinContribution ?? anneeCourante)
 *   totalAttenduCumule  = Σ attendu(année)                pour anneeAdhesion ≤ année ≤ borneFin
 *                         où attendu(année) = Contribution.montantAttendu s'il existe (snapshot
 *                         FIGÉ à l'ouverture, qui fait foi), sinon BaremeAnnuel.montantAttendu
 *   totalValoriseCumule = Σ Contribution.montantValorise  pour les mêmes années
 *
 *   statut :
 *     - A_JOUR      si totalValoriseCumule >= totalAttenduCumule
 *     - PARTIEL     si 0 < totalValoriseCumule < totalAttenduCumule
 *     - NON_A_JOUR  si totalValoriseCumule == 0
 *
 * Le statut n'est JAMAIS figé en base : il est toujours recalculé à partir des
 * `montantValorise` courants. C'est ce qui garantit qu'un équilibrage (qui redistribue
 * la valorisation entre années sans changer la somme) ne peut jamais faire « reculer »
 * un membre déjà à jour.
 */

import { attenduCumule, valoriseCumule } from './attendu'
import type { BaremeAnnuelInput, ContributionInput } from './attendu'

/** Valeurs alignées sur l'enum Prisma `StatutContribution` (sans importer Prisma). */
export type StatutContributionValue = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

// Les entrées et la règle d'attendu vivent dans `attendu.ts` ; réexportées pour les appelants.
export type { BaremeAnnuelInput, ContributionInput } from './attendu'

export interface StatutContributionParams {
  /** Barèmes annuels connus (l'ordre est indifférent). */
  baremes: BaremeAnnuelInput[]
  /** Contributions du membre (l'ordre est indifférent). */
  contributions: ContributionInput[]
  /** Année à partir de laquelle la contribution est attendue. */
  anneeAdhesion: number
  /**
   * Année de fin de contribution (renseignée si DECEDE/INACTIF). Optionnelle :
   * si absente ou null, on cumule jusqu'à `anneeCourante`.
   */
  anneeFinContribution?: number | null
  /** Année de référence du calcul (généralement l'année en cours). */
  anneeCourante: number
}

export interface StatutContributionResult {
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContributionValue
}

/**
 * Comportement décidé pour le cas §4.1/7 (année sans BaremeAnnuel configuré) :
 *
 *   → Une année comprise dans la borne de cumul mais pour laquelle AUCUN BaremeAnnuel
 *     n'existe encore est simplement IGNORÉE dans `totalAttenduCumule` (elle contribue
 *     0). On NE lève PAS d'erreur.
 *
 * Justification : le barème est la source de vérité du montant attendu (§4.2, un seul
 * montant par année). Tant que l'admin n'a pas configuré l'année, il n'existe aucun
 * montant attendu à réclamer — on ne peut donc rien attendre pour cette année. La somme
 * Σ de la spec §4.1 porte explicitement sur les `BaremeAnnuel` existants ; une année
 * non configurée n'apparaît pas dans cette somme. Cela évite aussi de bloquer le calcul
 * de statut de toute l'association parce qu'une seule année n'est pas encore ouverte.
 */
export function calculerStatutContribution(
  params: StatutContributionParams,
): StatutContributionResult {
  const {
    baremes,
    contributions,
    anneeAdhesion,
    anneeFinContribution,
    anneeCourante,
  } = params

  // L'ATTENDU et le VALORISÉ sont calculés par `attendu.ts`, seul module à répondre « combien ce
  // membre doit-il ? ». Ce cœur-ci ne porte plus que le SEUIL (à jour / partiel / pas à jour).
  const fenetre = { baremes, contributions, anneeAdhesion, anneeFinContribution, anneeCourante }
  const totalAttenduCumule = attenduCumule(fenetre)
  const totalValoriseCumule = valoriseCumule(fenetre)

  // Ordre des tests important : `>=` traité en premier pour couvrir le cas
  // attendu == 0 (rien dû) => A_JOUR, y compris quand valorisé == 0.
  let statut: StatutContributionValue
  if (totalValoriseCumule >= totalAttenduCumule) {
    statut = 'A_JOUR'
  } else if (totalValoriseCumule === 0) {
    statut = 'NON_A_JOUR'
  } else {
    statut = 'PARTIEL'
  }

  return { totalAttenduCumule, totalValoriseCumule, statut }
}

/**
 * Années encore DUES (non entièrement soldées) dans la fenêtre de contribution — pour la relance.
 *
 * Le modèle est CUMULATIF (la valorisation se redistribue entre années, cf. équilibrage §4.1), donc
 * on n'oppose PAS bêtement le valorisé de chaque année à son attendu. On alloue le valorisé TOTAL
 * aux années par ordre chronologique (les plus anciennes d'abord — logique d'arriérés) : une année
 * est DUE dès que le solde restant ne la couvre pas entièrement. Renvoie les années triées croissant
 * (vide si le membre est à jour). Une année sans barème (montant attendu 0) n'est jamais due.
 */
export function anneesImpayees(params: StatutContributionParams): number[] {
  const { baremes, contributions, anneeAdhesion, anneeFinContribution, anneeCourante } = params
  const borneFin = Math.min(anneeCourante, anneeFinContribution ?? anneeCourante)

  let solde = contributions
    .filter((c) => c.annee >= anneeAdhesion && c.annee <= borneFin)
    .reduce((somme, c) => somme + c.montantValorise, 0)

  const dues: number[] = []
  const anneesAttendues = baremes
    .filter((b) => b.annee >= anneeAdhesion && b.annee <= borneFin && b.montantAttendu > 0)
    .sort((a, b) => a.annee - b.annee)

  for (const b of anneesAttendues) {
    if (solde >= b.montantAttendu) {
      solde -= b.montantAttendu // année soldée par le cumul
    } else {
      dues.push(b.annee) // partiellement ou pas couverte → due
      solde = 0
    }
  }
  return dues
}
