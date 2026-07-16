import { request, rid } from './core'
import type { ModeVersement } from './types'

/* -------------------------------------------------------------------------- */
/* Amendes / pénalités (§4.10)                                                */
/* -------------------------------------------------------------------------- */

export type TypeAmende = 'RETARD_COTISATION' | 'ABSENCE_REUNION' | 'AUTRE'
export type StatutAmende = 'IMPAYEE' | 'PAYEE' | 'ANNULEE'

export interface Amende {
  id: string
  type: TypeAmende
  motif: string
  montant: number
  dateAmende: string
  statut: StatutAmende
  datePaiement: string | null
  modePaiement: ModeVersement | null
  membreId: string
  membre: { id: string; nom: string; prenom: string }
  createdAt: string
}

export interface AmendesReponse {
  amendes: Amende[]
  totaux: { du: number; encaisse: number }
}

export interface AmendeInput {
  membreId: string
  type?: TypeAmende
  motif: string
  montant: number
  dateAmende?: string
}

export interface PayerAmendeInput {
  datePaiement?: string
  modePaiement?: ModeVersement
}

function qsAmendes(f: { membreId?: string; statut?: StatutAmende } = {}): string {
  const p = new URLSearchParams()
  if (f.membreId) p.set('membreId', f.membreId)
  if (f.statut) p.set('statut', f.statut)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const amendesApi = {
  list: (
    filtre: { membreId?: string; statut?: StatutAmende },
    accessToken: string,
    signal?: AbortSignal,
  ) => request<AmendesReponse>(`/amendes${qsAmendes(filtre)}`, { accessToken, signal }),
  create: (body: AmendeInput, accessToken: string) =>
    request<Amende>('/amendes', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: Partial<Omit<AmendeInput, 'membreId'>>, accessToken: string) =>
    request<Amende>(`/amendes/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/amendes/${rid(id)}`, { method: 'DELETE', accessToken }),
  payer: (id: string, body: PayerAmendeInput, accessToken: string) =>
    request<Amende>(`/amendes/${rid(id)}/payer`, { method: 'POST', json: body, accessToken }),
  annuler: (id: string, accessToken: string) =>
    request<Amende>(`/amendes/${rid(id)}/annuler`, { method: 'POST', accessToken }),
}
