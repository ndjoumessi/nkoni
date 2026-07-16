import { request, rid } from './core'

/* Fonctions/organes + historique des nominations (V1.1 §5) -------------------- */

/** Membre exposé avec une affectation (titulaire). */
export interface AffectationMembre {
  id: string
  nom: string
  prenom: string
}

/** Fonction exposée avec une affectation (référence légère). */
export interface AffectationFonctionRef {
  id: string
  nom: string
  description: string | null
}

/** Une nomination (affectation). `dateFin === null` ⇒ titulaire en cours. */
export interface Affectation {
  id: string
  fonctionId: string
  membreId: string
  dateDebut: string
  dateFin: string | null
  notes: string | null
  createdAt: string
  membre?: AffectationMembre // inclus selon l'endpoint
  fonction?: AffectationFonctionRef // inclus selon l'endpoint
}

/** Ligne de liste GET /fonctions : titulaire actuel (0 ou 1) + taille d'historique. */
export interface FonctionListItem {
  id: string
  nom: string
  description: string | null
  createdAt: string
  affectations: Affectation[]
  _count: { affectations: number }
}

/** Détail GET /fonctions/:id : historique complet (plus récentes d'abord). */
export interface FonctionDetail {
  id: string
  nom: string
  description: string | null
  createdAt: string
  affectations: Affectation[]
}

/** Fonction « nue » renvoyée par create/update (sans include). */
export interface Fonction {
  id: string
  nom: string
  description: string | null
  createdAt: string
}

export interface FonctionInput {
  nom: string
  description?: string
}

export interface FonctionUpdateInput {
  nom?: string
  description?: string | null
}

export interface AffectationCreateInput {
  fonctionId: string
  membreId: string
  dateDebut: string
  notes?: string
}

export const fonctionsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<FonctionListItem[]>('/fonctions', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<FonctionDetail>(`/fonctions/${rid(id)}`, { accessToken, signal }),
  create: (body: FonctionInput, accessToken: string) =>
    request<Fonction>('/fonctions', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: FonctionUpdateInput, accessToken: string) =>
    request<Fonction>(`/fonctions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/fonctions/${rid(id)}`, { method: 'DELETE', accessToken }),
  historique: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>(`/fonctions/${rid(id)}/affectations`, { accessToken, signal }),
}
