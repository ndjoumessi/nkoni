import { ApiError, type StatutContribution, type StatutMembre } from './api'

/** Visibilité de la carte « Contributions » de la fiche membre après échec d'un chargement. */
export interface AccesFinancier {
  /** La carte doit-elle rester visible ? */
  visible: boolean
  /** Faut-il afficher un état d'erreur dans la carte ? */
  erreur: boolean
}

/**
 * Classe une erreur du chargement financier (contributions) de la fiche membre.
 *
 * - **403** = pas de droit de lecture (ex. SECRETAIRE) → carte masquée, comportement voulu.
 * - **toute autre erreur** (500, réseau) → carte VISIBLE en état d'erreur : on ne fait plus
 *   disparaître en silence le point d'entrée « Saisir un versement » (bug « cas (a) »). L'appelant
 *   ignore l'annulation (AbortError) en amont via son drapeau `active`.
 */
export function accesFinancierApresErreur(e: unknown): AccesFinancier {
  if (e instanceof ApiError && e.status === 403) return { visible: false, erreur: false }
  return { visible: true, erreur: true }
}

export interface ResumeMembres {
  /** Effectif total (tous statuts confondus). */
  total: number
  /** Membres ACTIF = population à obligation de cotisation active (« éligibles »). */
  actifs: number
  /** À jour PARMI les actifs. */
  aJour: number
  /** Non à jour PARMI les actifs. */
  nonAJour: number
  /** Membres non-ACTIF (INACTIF ou DECEDE). */
  inactifs: number
}

/**
 * Synthèse des compteurs de la page Membres.
 *
 * Les compteurs de COTISATION (`aJour`/`nonAJour`) ne portent QUE sur les membres **ACTIF** — la
 * population ayant une obligation de cotisation active, cohérent avec la définition d'« éligible »
 * du backend (`contribution.service` / `rapport.service`, qui filtrent `statut: 'ACTIF'`).
 *
 * Conséquence voulue : un membre **DECEDE/INACTIF** n'est plus compté dans `nonAJour` même si son
 * statut de cotisation cumulatif reste `NON_A_JOUR` (arriérés) — il n'apparaît que dans `inactifs`.
 * Fin du double-comptage (un décédé n'inflait plus à la fois « Non à jour » ET « Inactifs/Décédés »).
 */
export function resumeMembres(
  membres: readonly { statut: StatutMembre; statutCotisation: StatutContribution }[],
): ResumeMembres {
  const actifs = membres.filter((m) => m.statut === 'ACTIF')
  return {
    total: membres.length,
    actifs: actifs.length,
    aJour: actifs.filter((m) => m.statutCotisation === 'A_JOUR').length,
    nonAJour: actifs.filter((m) => m.statutCotisation === 'NON_A_JOUR').length,
    inactifs: membres.filter((m) => m.statut !== 'ACTIF').length,
  }
}
