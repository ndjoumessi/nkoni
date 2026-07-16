import { request, rid } from './core'
import type { ModeVersement } from './types'

/* -------------------------------------------------------------------------- */
/* Cagnottes d'événement (§4.9) — collectes de solidarité                     */
/* -------------------------------------------------------------------------- */

export type TypeCagnotte = 'DEUIL' | 'MARIAGE' | 'NAISSANCE' | 'AUTRE'
export type StatutCagnotte = 'OUVERTE' | 'CLOTUREE'

export interface DonCagnotte {
  id: string
  montant: number
  date: string
  mode: ModeVersement
  note: string | null
  membre: { id: string; nom: string; prenom: string }
}

export interface Cagnotte {
  id: string
  titre: string
  type: TypeCagnotte
  description: string | null
  objectif: number | null
  dateEvenement: string | null
  statut: StatutCagnotte
  beneficiaireMembreId: string | null
  beneficiaireNom: string | null
  beneficiaireMembre: { id: string; nom: string; prenom: string } | null
  /** Bénéficiaire résolu (nom du membre, sinon nom libre). */
  beneficiaire: string | null
  montantReverse: number
  dateReversement: string | null
  createdAt: string
  collecte: number
  nbDons: number
  progression: number | null
  solde: number
}

export interface CagnotteDetail extends Cagnotte {
  dons: DonCagnotte[]
}

export interface CagnotteInput {
  titre: string
  type?: TypeCagnotte
  description?: string
  objectif?: number
  dateEvenement?: string
  beneficiaireMembreId?: string
  beneficiaireNom?: string
}

export interface DonInput {
  membreId: string
  montant: number
  date?: string
  mode?: ModeVersement
  note?: string
}

export interface ClotureInput {
  montantReverse?: number
  dateReversement?: string
}

export const cagnottesApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Cagnotte[]>('/cagnottes', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<CagnotteDetail>(`/cagnottes/${rid(id)}`, { accessToken, signal }),
  create: (body: CagnotteInput, accessToken: string) =>
    request<Cagnotte>('/cagnottes', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: Partial<CagnotteInput>, accessToken: string) =>
    request<Cagnotte>(`/cagnottes/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/cagnottes/${rid(id)}`, { method: 'DELETE', accessToken }),
  ajouterDon: (id: string, body: DonInput, accessToken: string) =>
    request<DonCagnotte>(`/cagnottes/${rid(id)}/dons`, { method: 'POST', json: body, accessToken }),
  supprimerDon: (id: string, donId: string, accessToken: string) =>
    request<void>(`/cagnottes/${rid(id)}/dons/${rid(donId)}`, { method: 'DELETE', accessToken }),
  cloturer: (id: string, body: ClotureInput, accessToken: string) =>
    request<Cagnotte>(`/cagnottes/${rid(id)}/cloturer`, { method: 'POST', json: body, accessToken }),
  rouvrir: (id: string, accessToken: string) =>
    request<Cagnotte>(`/cagnottes/${rid(id)}/rouvrir`, { method: 'POST', accessToken }),
}
