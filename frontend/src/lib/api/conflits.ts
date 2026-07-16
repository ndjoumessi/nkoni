import { request, rid } from './core'

/* Conflits familiaux (V2 §4.4) — module sensible ----------------------------- */

export type NiveauConfidentialite = 'PUBLIC' | 'BUREAU' | 'CONFIDENTIEL'
export type StatutConflit = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'CLOS'

/** Référence légère d'un compte (auteur / responsable), champs sûrs uniquement. */
export interface ConflitUtilisateurRef {
  id: string
  email: string
  role: string
}

export interface ConflitMembreRef {
  id: string
  nom: string
  prenom: string
}

/**
 * Conflit tel que renvoyé par l'API. La visibilité est déjà filtrée côté serveur :
 * le front ne reçoit JAMAIS un conflit hors périmètre du demandeur.
 */
export interface Conflit {
  id: string
  titre: string
  description: string
  niveauConfidentialite: NiveauConfidentialite
  statut: StatutConflit
  auteurId: string
  responsableSuiviId: string | null
  dateOuverture: string
  dateResolution: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  auteur: ConflitUtilisateurRef | null
  responsableSuivi: ConflitUtilisateurRef | null
  membresConcernes: ConflitMembreRef[]
}

export interface ConflitCreateInput {
  titre: string
  description: string
  niveauConfidentialite: NiveauConfidentialite
  /** Pertinent seulement si niveauConfidentialite = CONFIDENTIEL. */
  responsableSuiviId?: string
  membresConcernes?: string[]
  notes?: string
}

export interface ConflitUpdateInput {
  statut?: StatutConflit
  notes?: string | null
}

export const conflitsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Conflit[]>('/conflits', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Conflit>(`/conflits/${rid(id)}`, { accessToken, signal }),
  create: (body: ConflitCreateInput, accessToken: string) =>
    request<Conflit>('/conflits', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: ConflitUpdateInput, accessToken: string) =>
    request<Conflit>(`/conflits/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  /** Comptes désignables comme responsable de suivi (réservé aux déclarants). */
  responsables: (accessToken: string, signal?: AbortSignal) =>
    request<ConflitUtilisateurRef[]>('/conflits/responsables', { accessToken, signal }),
}
