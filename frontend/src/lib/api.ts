/**
 * Client HTTP minimal pour l'API NKONI.
 *
 * `credentials: 'include'` est OBLIGATOIRE : c'est ce qui permet au cookie httpOnly
 * du refresh token d'être envoyé/reçu en cross-origin (le back autorise CORS avec
 * credentials sur l'origine du front).
 */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface AuthUser {
  id: string
  email: string
  role: string
  membreId?: string | null
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export interface RefreshResponse {
  accessToken: string
}

/** Erreur porteuse du code HTTP, pour un traitement fin côté UI (401, 403, …). */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  json?: unknown
  accessToken?: string | null
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, accessToken, signal } = options

  const headers: Record<string, string> = {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
    signal,
  })

  // 204 No Content (ex. logout) → pas de corps à parser.
  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Erreur ${res.status}`
    throw new ApiError(res.status, message)
  }

  return data as T
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password },
    }),
  refresh: (signal?: AbortSignal) =>
    request<RefreshResponse>('/auth/refresh', { method: 'POST', signal }),
  me: (accessToken: string, signal?: AbortSignal) =>
    request<AuthUser>('/auth/me', { accessToken, signal }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
}
