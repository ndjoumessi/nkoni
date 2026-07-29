import { request, rid } from './core'

/* -------------------------------------------------------------------------- */
/* Tontine (§ tontine) — épargne rotative (ROSCA)                             */
/* -------------------------------------------------------------------------- */

export type ModeRotation = 'ORDRE_FIXE' | 'TIRAGE' | 'ENCHERE'
export type StatutCycleTontine = 'EN_COURS' | 'TERMINE' | 'ANNULE'
export type StatutTourTontine = 'A_VENIR' | 'REVERSE'

export interface ParticipationTontine {
  id: string
  membreId: string
  /** Nombre de parts : la mise du membre vaut `parts × montantBaseMise`. */
  parts: number
  /** Position dans la rotation (sert de rang de bénéficiaire en ORDRE_FIXE). */
  ordre: number
}

/** Mise d'un participant pour un tour (suivi de collecte). */
export interface MiseTontine {
  membreId: string
  montant: number
}

export interface TourTontine {
  id: string
  numero: number
  /** `null` tant qu'aucun bénéficiaire n'est attribué (TIRAGE non encore effectué). */
  beneficiaireId: string | null
  /** Figé au reversement (Σ des mises encaissées) ; 0 avant. */
  montantPot: number
  statut: StatutTourTontine
  dateReversement: string | null
  /** Mises déjà enregistrées pour ce tour → checklist payé/non-payé + collecté à ce jour. */
  mises: MiseTontine[]
}

export interface CycleTontine {
  id: string
  numero: number
  statut: StatutCycleTontine
  dateDebut: string
  dateFin: string | null
  participations: ParticipationTontine[]
  tours: TourTontine[]
}

export interface Tontine {
  id: string
  nom: string
  montantBaseMise: number
  modeRotation: ModeRotation
  actif: boolean
  createdAt: string
  _count: { cycles: number }
}

export interface TontineDetail extends Omit<Tontine, '_count'> {
  cycles: CycleTontine[]
}

export interface TontineInput {
  nom: string
  montantBaseMise: number
  modeRotation?: ModeRotation
}

export interface ParticipantInput {
  membreId: string
  parts?: number
}

export const tontinesApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Tontine[]>('/tontines', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<TontineDetail>(`/tontines/${rid(id)}`, { accessToken, signal }),
  create: (body: TontineInput, accessToken: string) =>
    request<Tontine>('/tontines', { method: 'POST', json: body, accessToken }),
  /** Ouvre un cycle : l'ORDRE de la rotation suit l'ordre de la liste `participants`. */
  ouvrirCycle: (id: string, participants: ParticipantInput[], accessToken: string) =>
    request<{ cycleId: string }>(`/tontines/${rid(id)}/cycles`, {
      method: 'POST',
      json: { participants },
      accessToken,
    }),
  /** TIRAGE uniquement : tire un bénéficiaire parmi ceux qui n'ont pas encore reçu. */
  tirer: (tourId: string, accessToken: string) =>
    request<{ tourId: string; beneficiaireId: string }>(`/tours/${rid(tourId)}/tirer`, {
      method: 'POST',
      accessToken,
    }),
  /** Flux d'argent. `montant` omis ⇒ le serveur applique `parts × montantBaseMise`. */
  enregistrerMise: (tourId: string, membreId: string, accessToken: string, montant?: number) =>
    request<{ tourId: string; membreId: string; montant: number }>(`/tours/${rid(tourId)}/mises`, {
      method: 'POST',
      json: montant === undefined ? { membreId } : { membreId, montant },
      accessToken,
    }),
  /** Flux d'argent : reverse le pot au bénéficiaire du tour (409 si non attribué / déjà reversé). */
  reverser: (tourId: string, accessToken: string) =>
    request<{ tourId: string; montantPot: number; beneficiaireId: string }>(
      `/tours/${rid(tourId)}/reverser`,
      { method: 'POST', accessToken },
    ),
}
