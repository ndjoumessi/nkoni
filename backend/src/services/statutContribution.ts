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
 *   totalAttenduCumule  = Σ BaremeAnnuel.montantAttendu   pour anneeAdhesion ≤ année ≤ borneFin
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

/** Valeurs alignées sur l'enum Prisma `StatutContribution` (sans importer Prisma). */
export type StatutContributionValue = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

/** Barème annuel global (montant attendu uniforme pour l'année). */
export interface BaremeAnnuelInput {
  annee: number
  montantAttendu: number
}

/** Contribution du membre pour une année (valeur valorisée courante). */
export interface ContributionInput {
  annee: number
  montantValorise: number
}

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

  // Borne haute du cumul : on cesse d'accumuler après l'année de fin de contribution
  // (membre DECEDE/INACTIF), sans jamais dépasser l'année courante.
  const borneFin = Math.min(anneeCourante, anneeFinContribution ?? anneeCourante)

  const dansLaBorne = (annee: number): boolean =>
    annee >= anneeAdhesion && annee <= borneFin

  // Années non configurées (pas de BaremeAnnuel) : absentes de cette somme => ignorées.
  const totalAttenduCumule = baremes
    .filter((b) => dansLaBorne(b.annee))
    .reduce((somme, b) => somme + b.montantAttendu, 0)

  const totalValoriseCumule = contributions
    .filter((c) => dansLaBorne(c.annee))
    .reduce((somme, c) => somme + c.montantValorise, 0)

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
