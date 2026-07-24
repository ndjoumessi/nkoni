import { API_URL, leverSiErreur, request } from './core'
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
/** Aperçu de la carte de membre pour un rendu VISUEL dans l'app (même QR signé que le PDF). */
export interface CarteApercu {
  orgNom: string
  nom: string
  prenom: string
  branche: string | null
  anneeAdhesion: number
  statutCotisation: StatutContribution
  estChef: boolean
  chefSurnom: string | null
  /** `true` si le membre a une photo — le front la charge alors via GET /moi/photo. */
  aPhoto: boolean
  /** QR (image data URL) rendu côté serveur → aucune lib QR côté client. */
  qrDataUrl: string
}
export interface RecuMembre {
  id: string
  numero: string
  date: string
  /** Montant FIGÉ à l'émission — celui qu'atteste le PDF, pas celui du versement aujourd'hui. */
  montant: number
  /** `null` = reçu ACTIF. Renseigné ⇒ annulé : le numéro reste, le PDF n'est plus servi. */
  annuleLe: string | null
  /** `false` pour un reçu annulé — l'annoncer téléchargeable menait droit à un 409. */
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
  /** Télécharge la carte de membre (PDF avec QR) du compte connecté — proxy authentifié. */
  carte: async (accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/moi/carte`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Données de la carte pour un rendu VISUEL dans l'app (nom, statut, QR…). */
  carteApercu: (accessToken: string, signal?: AbortSignal) =>
    request<CarteApercu>('/moi/carte-apercu', { accessToken, signal }),
  /** Photo de profil du compte connecté (proxy authentifié) — Blob image, ou 404 si aucune. */
  photo: async (accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/moi/photo`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Téléverse sa propre photo de profil (JPEG/PNG). */
  televerserPhoto: async (fichier: File, accessToken: string): Promise<void> => {
    const form = new FormData()
    form.append('fichier', fichier)
    const res = await fetch(`${API_URL}/moi/photo`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    await leverSiErreur(res)
  },
  /** Retire sa propre photo de profil. */
  supprimerPhoto: (accessToken: string) =>
    request<void>('/moi/photo', { method: 'DELETE', accessToken }),
  /** Le paiement en ligne est-il actif pour l'org du membre ? + montant minimum (source unique serveur). */
  paiementDisponible: (accessToken: string, signal?: AbortSignal) =>
    request<{ actif: boolean; montantMin: number }>('/moi/paiement-disponible', { accessToken, signal }),
  /** Lance le règlement en ligne d'une contribution → { paiementId, urlPaiement } (redirection). */
  demarrerPaiement: (contributionId: string, montant: number, accessToken: string) =>
    request<{ paiementId: string; urlPaiement?: string }>('/moi/paiements', {
      method: 'POST',
      json: { contributionId, montant },
      accessToken,
    }),
  /** Statut d'un paiement du membre (page de retour après redirection). */
  statutPaiement: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<{ statut: StatutPaiement }>(`/moi/paiements/${id}`, { accessToken, signal }),
}

export type StatutPaiement = 'EN_ATTENTE' | 'REUSSI' | 'ECHEC' | 'EXPIRE'
