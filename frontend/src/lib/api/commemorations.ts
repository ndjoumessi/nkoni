import { request, rid } from './core'

/* Commémorations / cérémonies (V2) ------------------------------------------- */

export type TypeCommemoration = 'COMMEMORATION' | 'CEREMONIE'
export type StatutCommemoration = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'

export interface CommemorationMembreRef {
  id: string
  nom: string
  prenom: string
}

export interface Commemoration {
  id: string
  titre: string
  type: TypeCommemoration
  date: string
  lieu: string | null
  description: string | null
  statut: StatutCommemoration
  notes: string | null
  createdAt: string
  updatedAt: string
  membresConcernes: CommemorationMembreRef[]
}

export interface CommemorationInput {
  titre: string
  date: string
  type?: TypeCommemoration
  lieu?: string
  description?: string
  statut?: StatutCommemoration
  notes?: string
  membresConcernes?: string[]
}

export interface CommemorationUpdateInput {
  titre?: string
  type?: TypeCommemoration
  date?: string
  lieu?: string | null
  description?: string | null
  statut?: StatutCommemoration
  notes?: string | null
  membresConcernes?: string[]
}

export const commemorationsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Commemoration[]>('/commemorations', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Commemoration>(`/commemorations/${rid(id)}`, { accessToken, signal }),
  create: (body: CommemorationInput, accessToken: string) =>
    request<Commemoration>('/commemorations', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: CommemorationUpdateInput, accessToken: string) =>
    request<Commemoration>(`/commemorations/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/commemorations/${rid(id)}`, { method: 'DELETE', accessToken }),
  /** Membres sélectionnables comme concernés/honorés (réservé aux gestionnaires). */
  membres: (accessToken: string, signal?: AbortSignal) =>
    request<CommemorationMembreRef[]>('/commemorations/membres', { accessToken, signal }),
}
