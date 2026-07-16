import { request } from './core'
import type { StatutContribution } from './types'

/* Espace membre self-service (§5) — routes /moi/* --------------------------- */

export interface SituationMembre {
  membre: {
    nom: string
    prenom: string
    branche: string | null
    statut: string
    anneeAdhesion: number
  }
  cotisation: { statut: StatutContribution; totalDu: number; totalVerse: number }
}
export interface ContributionMembre {
  id: string
  annee: number
  montantAttendu: number
  montantVerse: number
  montantValorise: number
  versements: { id: string; montant: number; dateVersement: string; mode: string }[]
}
export interface ReunionAVenir {
  id: string
  date: string
  lieu: string
  type: string
  statut: string
}
export interface RecuMembre {
  id: string
  numero: string
  date: string
  montant: number
  telechargeable: boolean
}

export const moiApi = {
  situation: (accessToken: string, signal?: AbortSignal) =>
    request<SituationMembre>('/moi/situation', { accessToken, signal }),
  contributions: (accessToken: string, signal?: AbortSignal) =>
    request<ContributionMembre[]>('/moi/contributions', { accessToken, signal }),
  reunions: (accessToken: string, signal?: AbortSignal) =>
    request<ReunionAVenir[]>('/moi/reunions', { accessToken, signal }),
  recus: (accessToken: string, signal?: AbortSignal) =>
    request<RecuMembre[]>('/moi/recus', { accessToken, signal }),
}
