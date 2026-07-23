import { request } from './core'

/* -------------------------------------------------------------------------- */
/* Statut & bannière d'incident (§2.2/§8)                                     */
/* -------------------------------------------------------------------------- */

export type GraviteIncident = 'INFO' | 'MAINTENANCE' | 'INCIDENT'

/** Réponse PUBLIQUE de GET /statut/incident — le message n'est présent que si la bannière est active. */
export type IncidentPublic =
  | { actif: false }
  | { actif: true; gravite: GraviteIncident; message: string; updatedAt: string }

/** État COMPLET (SUPER_ADMIN) pour pré-remplir l'éditeur — message visible même inactif. */
export interface IncidentAdmin {
  actif: boolean
  gravite: GraviteIncident
  message: string
  updatedAt?: string
}

export const statutApi = {
  /** Bannière d'incident courante — PUBLIC (page /statut). */
  incidentPublic: (signal?: AbortSignal) => request<IncidentPublic>('/statut/incident', { signal }),
  /** État complet de la bannière — SUPER_ADMIN (éditeur). */
  incidentAdmin: (accessToken: string, signal?: AbortSignal) =>
    request<IncidentAdmin>('/platform/statut/incident', { accessToken, signal }),
  /** Définit / met à jour la bannière — SUPER_ADMIN. */
  definirIncident: (
    data: { actif: boolean; gravite: GraviteIncident; message: string },
    accessToken: string,
  ) => request<IncidentAdmin>('/platform/statut/incident', { method: 'PUT', json: data, accessToken }),
}
