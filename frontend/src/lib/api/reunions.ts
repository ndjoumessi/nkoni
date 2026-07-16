import { request, rid } from './core'

/* -------------------------------------------------------------------------- */
/* Réunions, Ordre du jour, Résolutions (V1.1 §5)                            */
/* -------------------------------------------------------------------------- */

export type TypeReunion = 'ORDINAIRE' | 'EXTRAORDINAIRE'
export type StatutReunion = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'
export type StatutResolution = 'ADOPTEE' | 'REJETEE' | 'REPORTEE'

export interface PointOrdreDuJour {
  id: string
  reunionId: string
  titre: string
  ordre: number
  notes: string | null
  createdAt: string
}

export interface Resolution {
  id: string
  reunionId: string
  pointOrdreDuJourId: string | null
  texte: string
  statut: StatutResolution
  dateVote: string | null
  createdAt: string
  updatedAt: string
}

/** Ligne de liste GET /reunions (avec décompte points/résolutions). */
export interface ReunionListItem {
  id: string
  date: string
  lieu: string
  type: TypeReunion
  statut: StatutReunion
  compteRenduTexte: string | null
  createdAt: string
  updatedAt: string
  _count: { pointsOrdreDuJour: number; resolutions: number }
}

/** Détail GET /reunions/:id (points ordonnés + résolutions). */
export interface ReunionDetail {
  id: string
  date: string
  lieu: string
  type: TypeReunion
  statut: StatutReunion
  compteRenduTexte: string | null
  createdAt: string
  updatedAt: string
  pointsOrdreDuJour: PointOrdreDuJour[]
  resolutions: Resolution[]
}

export interface PointInput {
  titre: string
  notes?: string
}

export interface ReunionCreateInput {
  date: string
  lieu: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string
  pointsOrdreDuJour?: PointInput[]
}

export interface ReunionUpdateInput {
  date?: string
  lieu?: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string | null
}

export interface ResolutionCreateInput {
  texte: string
  statut?: StatutResolution
  dateVote?: string
  pointOrdreDuJourId?: string
}

export interface ResolutionUpdateInput {
  texte?: string
  statut?: StatutResolution
  dateVote?: string | null
  pointOrdreDuJourId?: string | null
}

export const reunionsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<ReunionListItem[]>('/reunions', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<ReunionDetail>(`/reunions/${rid(id)}`, { accessToken, signal }),
  create: (body: ReunionCreateInput, accessToken: string) =>
    request<ReunionDetail>('/reunions', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: ReunionUpdateInput, accessToken: string) =>
    request<ReunionDetail>(`/reunions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/reunions/${rid(id)}`, { method: 'DELETE', accessToken }),
  addPoint: (reunionId: string, body: PointInput, accessToken: string) =>
    request<PointOrdreDuJour>(`/reunions/${rid(reunionId)}/points`, {
      method: 'POST',
      json: body,
      accessToken,
    }),
  updatePoint: (
    reunionId: string,
    pointId: string,
    body: { titre?: string; notes?: string | null },
    accessToken: string,
  ) =>
    request<PointOrdreDuJour>(`/reunions/${rid(reunionId)}/points/${rid(pointId)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  removePoint: (reunionId: string, pointId: string, accessToken: string) =>
    request<void>(`/reunions/${rid(reunionId)}/points/${rid(pointId)}`, {
      method: 'DELETE',
      accessToken,
    }),
  reorderPoints: (reunionId: string, ordreIds: string[], accessToken: string) =>
    request<ReunionDetail>(`/reunions/${rid(reunionId)}/points/ordre`, {
      method: 'PUT',
      json: { ordreIds },
      accessToken,
    }),
}
