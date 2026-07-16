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

export type ModeVersement = 'ESPECES' | 'TIERS' | 'AUTRE'

/* Pagination générique (miroir de `backend/src/lib/pagination.ts::PageResultat`) */

/** Réponse paginée générique (miroir de `backend/src/lib/pagination.ts::PageResultat`). */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
