import { request } from './core'
import type { Contribution } from './membres'
import type { ModeVersement } from './types'

/* -------------------------------------------------------------------------- */
/* Versements (§4.4)                                                          */
/* -------------------------------------------------------------------------- */

export interface Versement {
  id: string
  contributionId: string
  montant: number
  dateVersement: string
  mode: ModeVersement
  receptionnaireId: string | null
  note: string | null
  createdAt: string
}

export interface VersementInput {
  contributionId: string
  montant: number
  dateVersement: string
  mode: ModeVersement
  note?: string
}

/** Champs modifiables d'un versement (PATCH /versements/:id) — tous optionnels. */
export interface VersementUpdateInput {
  montant?: number
  dateVersement?: string
  mode?: ModeVersement
  note?: string | null
}

/** Réponse de POST /versements : le versement + la contribution aux totaux réajustés. */
export interface VersementCree {
  versement: Versement
  contribution: Contribution
}

export const versementsApi = {
  listByContribution: (contributionId: string, accessToken: string, signal?: AbortSignal) =>
    request<Versement[]>(
      `/versements?contributionId=${encodeURIComponent(contributionId)}`,
      { accessToken, signal },
    ),
  create: (body: VersementInput, accessToken: string, cleIdempotence?: string) =>
    request<VersementCree>('/versements', {
      method: 'POST',
      json: body,
      accessToken,
      ...(cleIdempotence ? { cleIdempotence } : {}),
    }),
  /** Modifie un versement (PATCH). Le back reporte automatiquement le delta sur les totaux. */
  modifier: (versementId: string, body: VersementUpdateInput, accessToken: string) =>
    request<Versement>(`/versements/${encodeURIComponent(versementId)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  /** Supprime un versement (DELETE). Le back décrémente montantVerse & montantValorise. */
  supprimer: (versementId: string, accessToken: string) =>
    request<void>(`/versements/${encodeURIComponent(versementId)}`, {
      method: 'DELETE',
      accessToken,
    }),
}
