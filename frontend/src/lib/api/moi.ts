import { API_URL, leverSiErreur, request, rid } from './core'
import type { StatutContribution } from './types'
import type { StatutPresence, SensVote } from './reunions'

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
  /** Réponse RSVP du membre pour cette réunion — `null` s'il n'a pas encore répondu. */
  monStatut: StatutPresence | null
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
/** Résolution ouverte au vote, pour la carte « Votes en cours » de l'espace membre. */
export interface ResolutionOuverte {
  id: string
  texte: string
  reunionDate: string
  reunionLieu: string
  /** Sens déjà voté par le membre, ou `null` s'il n'a pas encore voté. */
  monVote: SensVote | null
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

/** Amende du membre (§4.10), lecture seule. `type`/`statut` = enums rendus via i18n. */
export interface AmendeMembre {
  id: string
  type: string
  motif: string
  montant: number
  dateAmende: string
  statut: string
  datePaiement: string | null
}
/** Cagnotte ouverte (§4.9) vue par le membre : progression collective + son don personnel. */
export interface CagnotteMembre {
  id: string
  titre: string
  type: string
  objectif: number | null
  dateEvenement: string | null
  collecteTotal: number
  monDon: number
}
/** Un tour d'un cycle de tontine, du point de vue du membre. */
export interface TontineTourMembre {
  numero: number
  statut: string
  jeSuisBeneficiaire: boolean
  /** `true` seulement si la mise versée COUVRE la mise due (un versement partiel reste `false`). */
  maMisePayee: boolean
  /** Montant réellement versé pour ce tour (0 = rien ; entre 0 et la mise due = partiel). */
  monMontantMise: number
  /** Pot RÉEL figé, seulement une fois le tour reversé ; sinon `null` (mise due affichée à la place). */
  montantPot: number | null
}
/** Participation du membre à un cycle de tontine (§ tontine), lecture seule. */
export interface TontineMembre {
  tontineNom: string
  modeRotation: string
  cycleNumero: number
  cycleStatut: string
  maParts: number
  monOrdre: number
  /** Mise due par tour = parts × mise de base. */
  miseDue: number
  tours: TontineTourMembre[]
}

/** Détail d'un reçu (données du snapshot + membre + org) pour un rendu HTML natif dans l'app. */
export interface RecuDetail {
  numero: string
  montant: number
  annee: number
  mode: string
  dateVersement: string
  dateGeneration: string
  annuleLe: string | null
  membreNom: string
  membrePrenom: string
  orgNom: string
}

export const moiApi = {
  situation: (accessToken: string, signal?: AbortSignal) =>
    request<SituationMembre>('/moi/situation', { accessToken, signal }),
  contributions: (accessToken: string, signal?: AbortSignal) =>
    request<ContributionMembre[]>('/moi/contributions', { accessToken, signal }),
  reunions: (accessToken: string, signal?: AbortSignal) =>
    request<ReunionAVenir[]>('/moi/reunions', { accessToken, signal }),
  /** Pose/actualise SA réponse de présence (RSVP) à une réunion. */
  rsvp: (reunionId: string, statut: StatutPresence, accessToken: string) =>
    request<{ statut: StatutPresence }>(`/moi/reunions/${rid(reunionId)}/rsvp`, {
      method: 'PUT',
      json: { statut },
      accessToken,
    }),
  /** Résolutions ouvertes au vote (avec le sens déjà exprimé par le membre). */
  resolutionsOuvertes: (accessToken: string, signal?: AbortSignal) =>
    request<ResolutionOuverte[]>('/moi/resolutions', { accessToken, signal }),
  /** Pose/actualise SON vote sur une résolution ouverte. */
  voterResolution: (resolutionId: string, sens: SensVote, accessToken: string) =>
    request<{ sens: SensVote }>(`/moi/resolutions/${rid(resolutionId)}/vote`, {
      method: 'PUT',
      json: { sens },
      accessToken,
    }),
  recus: (accessToken: string, signal?: AbortSignal) =>
    request<RecuMembre[]>('/moi/recus', { accessToken, signal }),
  /** Détail d'UN reçu (données, pas le PDF) — pour l'aperçu HTML en modale. */
  recuDetail: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<RecuDetail>(`/moi/recus/${rid(id)}`, { accessToken, signal }),
  /** SES amendes (lecture seule). */
  amendes: (accessToken: string, signal?: AbortSignal) =>
    request<AmendeMembre[]>('/moi/amendes', { accessToken, signal }),
  /** Cagnottes ouvertes + son don personnel (lecture seule). */
  cagnottes: (accessToken: string, signal?: AbortSignal) =>
    request<CagnotteMembre[]>('/moi/cagnottes', { accessToken, signal }),
  /** SES participations aux tontines (cycles, tours, mise due/payée) — lecture seule. */
  tontines: (accessToken: string, signal?: AbortSignal) =>
    request<TontineMembre[]>('/moi/tontines', { accessToken, signal }),
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
  /** Avatar de COMPTE (tout compte, même sans fiche membre) — proxy authentifié ; Blob image ou 404. */
  avatar: async (accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/moi/avatar`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Téléverse son propre avatar de compte (JPEG/PNG). */
  televerserAvatar: async (fichier: File, accessToken: string): Promise<void> => {
    const form = new FormData()
    form.append('fichier', fichier)
    const res = await fetch(`${API_URL}/moi/avatar`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    await leverSiErreur(res)
  },
  /** Retire son propre avatar de compte. */
  supprimerAvatar: (accessToken: string) =>
    request<void>('/moi/avatar', { method: 'DELETE', accessToken }),
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
