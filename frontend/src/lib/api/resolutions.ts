import { request, rid } from './core'
import type { Resolution, ResolutionCreateInput, ResolutionUpdateInput } from './reunions'

export const resolutionsApi = {
  listByReunion: (reunionId: string, accessToken: string, signal?: AbortSignal) =>
    request<Resolution[]>(`/reunions/${rid(reunionId)}/resolutions`, { accessToken, signal }),
  create: (reunionId: string, body: ResolutionCreateInput, accessToken: string) =>
    request<Resolution>(`/reunions/${rid(reunionId)}/resolutions`, {
      method: 'POST',
      json: body,
      accessToken,
    }),
  update: (id: string, body: ResolutionUpdateInput, accessToken: string) =>
    request<Resolution>(`/resolutions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/resolutions/${rid(id)}`, { method: 'DELETE', accessToken }),
}
