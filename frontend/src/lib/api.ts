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

/* -------------------------------------------------------------------------- */
/* Tableau de bord (§5.8) — 4 vues selon le rôle (discriminées par `vue`)     */
/* -------------------------------------------------------------------------- */

export type StatutContribution = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

export interface Finances {
  totalAttenduCumule: number
  totalCollecteCumule: number
  /** Taux de recouvrement en % (collecté / attendu). */
  tauxRecouvrement: number
}

export interface RepartitionStatutContribution {
  A_JOUR: number
  PARTIEL: number
  NON_A_JOUR: number
}

export interface RepartitionStatutMembre {
  ACTIF: number
  INACTIF: number
  DECEDE: number
}

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardFinancier {
  vue: 'FINANCIER'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardRestreint {
  vue: 'RESTREINT'
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
}

export interface DashboardPerso {
  vue: 'PERSO'
  membreId: string
  anneeCourante: number
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContribution
}

export type Dashboard =
  | DashboardComplet
  | DashboardFinancier
  | DashboardRestreint
  | DashboardPerso

export const dashboardApi = {
  get: (accessToken: string, signal?: AbortSignal) =>
    request<Dashboard>('/dashboard', { accessToken, signal }),
}

/* -------------------------------------------------------------------------- */
/* Export des contributions (§5.9) — téléchargement binaire (PDF/Excel)       */
/* -------------------------------------------------------------------------- */

export interface ExportParams {
  format: 'xlsx' | 'pdf'
  annee?: number
  membreId?: string
}

/** Extrait le nom de fichier d'un en-tête `Content-Disposition`. */
function nomFichierDepuisDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const match = /filename="?([^"]+)"?/.exec(disposition)
  return match ? match[1] : null
}

/**
 * Télécharge l'export des contributions et déclenche l'enregistrement du fichier.
 *
 * L'access token étant gardé en mémoire (pas de cookie d'access), on ne peut pas utiliser
 * un simple `<a href>` : on fait un fetch authentifié, on lit le corps en Blob, puis on
 * force le téléchargement via un lien object-URL éphémère.
 */
export async function downloadExportContributions(
  params: ExportParams,
  accessToken: string,
): Promise<void> {
  const qs = new URLSearchParams({ format: params.format })
  if (params.annee !== undefined) qs.set('annee', String(params.annee))
  if (params.membreId) qs.set('membreId', params.membreId)

  const res = await fetch(`${API_URL}/exports/contributions?${qs.toString()}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const data = (await res.json()) as { message?: unknown }
      if (data?.message) message = String(data.message)
    } catch {
      // corps non-JSON : on garde le message générique
    }
    throw new ApiError(res.status, message)
  }

  const blob = await res.blob()
  const filename =
    nomFichierDepuisDisposition(res.headers.get('Content-Disposition')) ??
    `contributions.${params.format}`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
