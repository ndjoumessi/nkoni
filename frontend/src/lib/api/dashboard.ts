import { request } from './core'
import type { RepartitionStatutContribution, StatutContribution } from './types'

/* -------------------------------------------------------------------------- */
/* Tableau de bord (§5.8) — 4 vues selon le rôle (discriminées par `vue`)     */
/* -------------------------------------------------------------------------- */

export interface Finances {
  totalAttenduCumule: number
  totalCollecteCumule: number
  /** Taux de recouvrement en % (collecté / attendu). */
  tauxRecouvrement: number
}

export interface RepartitionStatutMembre {
  ACTIF: number
  INACTIF: number
  DECEDE: number
}

/** Un point de l'évolution mensuelle du recouvrement (année courante). */
export interface EvolutionMois {
  /** Mois 1 (janvier) → 12 (décembre). */
  mois: number
  collecte: number
  attendu: number
  /** Collecté du même mois l'année précédente (comparaison N vs N-1). */
  collecteN1: number
}

export interface AnniversaireMembre {
  id: string
  nom: string
  prenom: string
  /** Jour du mois (1 → 31). */
  jour: number
}

/** Vue financière consolidée du dashboard : au-delà des cotisations (caisse, cagnottes, amendes). */
export interface FinancesConsolidees {
  /** Solde de caisse = Σ versements − Σ dépenses approuvées/payées. */
  soldeTresorerie: number
  cagnottes: { nombreOuvertes: number; totalCollecte: number }
  amendes: { du: number; encaisse: number }
}

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
  /** 12 entrées (janv.→déc.) : collecté mensuel vs cible mensuelle sur l'année courante. */
  evolutionMensuelle: EvolutionMois[]
  nombreBranches: number
  /** Membres fêtant leur anniversaire ce mois-ci (triés par jour). */
  anniversaires: AnniversaireMembre[]
  /** Vue financière consolidée (trésorerie + cagnottes + amendes). */
  financesConsolidees?: FinancesConsolidees
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardFinancier {
  vue: 'FINANCIER'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  /** Vue financière consolidée (trésorerie + cagnottes + amendes). */
  financesConsolidees?: FinancesConsolidees
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardRestreint {
  vue: 'RESTREINT'
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
}

export interface DashboardPerso {
  vue: 'PERSO'
  membreId: string
  anneeCourante: number
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContribution
}

export type Dashboard =
  | DashboardComplet
  | DashboardFinancier
  | DashboardRestreint
  | DashboardPerso

export const dashboardApi = {
  get: (accessToken: string, signal?: AbortSignal) =>
    request<Dashboard>('/dashboard', { accessToken, signal }),
}
