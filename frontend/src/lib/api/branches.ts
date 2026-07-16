import { request } from './core'
import type { Branche } from './membres'

export const branchesApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Branche[]>('/branches', { accessToken, signal }),
}
