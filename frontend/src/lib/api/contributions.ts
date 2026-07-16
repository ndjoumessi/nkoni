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
}
