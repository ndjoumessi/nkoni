import { request } from './core'

/* -------------------------------------------------------------------------- */
/* Utilisateurs — gestion des comptes (§4.5, ADMIN uniquement)               */
/* -------------------------------------------------------------------------- */

/** Membre rattaché à un compte (le cas échéant). */
export interface UtilisateurMembreLie {
  id: string
  nom: string
  prenom: string
}

/** Compte utilisateur (jamais de passwordHash exposé par l'API). */
export interface Utilisateur {
  id: string
  email: string
  role: string
  actif: boolean
  createdAt: string
  updatedAt: string
  membre: UtilisateurMembreLie | null
}

export interface UtilisateurCreateInput {
  email: string
  password: string
  role: string
  membreId?: string
}

export interface UtilisateurUpdateInput {
  role?: string
  actif?: boolean
}

export const utilisateursApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Utilisateur[]>('/utilisateurs', { accessToken, signal }),
  create: (body: UtilisateurCreateInput, accessToken: string) =>
    request<Utilisateur>('/utilisateurs', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: UtilisateurUpdateInput, accessToken: string) =>
    request<Utilisateur>(`/utilisateurs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  // Réinitialisation ADMIN : impose un nouveau mot de passe à un AUTRE compte sans
  // connaître l'ancien (dépannage). 204 sans corps.
  reinitialiserMotDePasse: (id: string, nouveauMotDePasse: string, accessToken: string) =>
    request<void>(`/utilisateurs/${encodeURIComponent(id)}/mot-de-passe`, {
      method: 'PATCH',
      json: { nouveauMotDePasse },
      accessToken,
    }),
}
