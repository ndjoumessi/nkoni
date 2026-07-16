import { request, rid } from './core'
import type { Affectation, AffectationCreateInput } from './fonctions'

export const affectationsApi = {
  create: (body: AffectationCreateInput, accessToken: string) =>
    request<Affectation>('/affectations', { method: 'POST', json: body, accessToken }),
  actives: (accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>('/affectations/actives', { accessToken, signal }),
  parMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>(`/membres/${rid(membreId)}/affectations`, { accessToken, signal }),
}
