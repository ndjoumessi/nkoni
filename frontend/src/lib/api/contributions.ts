import { request } from './core'
import type { Contribution } from './membres'

export interface OuvrirAnneeResult {
  annee: number
  montantAttendu: number
  membresEligibles: number
  contributionsCreees: number
}

export const contributionsApi = {
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Contribution[]>(`/contributions?membreId=${encodeURIComponent(membreId)}`, {
      accessToken,
      signal,
    }),
  ouvrirAnnee: (annee: number, accessToken: string) =>
    request<OuvrirAnneeResult>('/contributions/ouvrir-annee', {
      method: 'POST',
      json: { annee },
      accessToken,
    }),
  /**
   * Ouverture CIBLÉE d'une année pour UN membre (pendant de `ouvrirAnnee`, globale à l'org).
   * Idempotent : renvoie la contribution existante si elle l'est déjà. Sert à encaisser une année
   * de la fenêtre d'adhésion jamais ouverte globalement.
   */
  ouvrirMembre: (membreId: string, annee: number, accessToken: string) =>
    request<Contribution>('/contributions/ouvrir-membre', {
      method: 'POST',
      json: { membreId, annee },
      accessToken,
    }),
}
