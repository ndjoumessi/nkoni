import { request } from './core'

export interface Bareme {
  id: string
  annee: number
  montantAttendu: number
  createdAt: string
}

export const baremeApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Bareme[]>('/baremes', { accessToken, signal }),
  create: (annee: number, montantAttendu: number, accessToken: string) =>
    request<Bareme>('/baremes', {
      method: 'POST',
      json: { annee, montantAttendu },
      accessToken,
    }),
  update: (id: string, montantAttendu: number, accessToken: string) =>
    request<Bareme>(`/baremes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: { montantAttendu },
      accessToken,
    }),
}
