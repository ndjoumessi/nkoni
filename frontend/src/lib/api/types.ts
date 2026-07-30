/**
 * Types partagés entre plusieurs domaines de l'API (évite les imports croisés entre
 * modules-domaines et les doublons d'export dans le barrel `../api`).
 */

/* Contributions / statut de cotisation (dashboard, rapports, membres, moi) --- */

export type StatutContribution = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

export interface RepartitionStatutContribution {
  A_JOUR: number
  PARTIEL: number
  NON_A_JOUR: number
}

/* Mode de versement (versements, cagnottes, amendes) ------------------------- */

/**
 * SOURCE UNIQUE côté front des modes de versement (miroir de `backend/src/lib/modes-versement.ts` —
 * le front ne peut pas importer le backend). Valeur RUNTIME (`as const`) pour que les listes
 * déroulantes la consomment au lieu de recopier le tableau ; le type en DÉRIVE. La cohérence avec
 * les libellés `commun.modesVersement` (fr + en) est gardée par `lib/modes-versement.test.ts`.
 */
export const MODES_VERSEMENT = ['ESPECES', 'TIERS', 'MOBILE_MONEY', 'AUTRE'] as const

export type ModeVersement = (typeof MODES_VERSEMENT)[number]

/* Pagination générique (miroir de `backend/src/lib/pagination.ts::PageResultat`) */

/** Réponse paginée générique (miroir de `backend/src/lib/pagination.ts::PageResultat`). */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
