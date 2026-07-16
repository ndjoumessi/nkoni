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
  /** Préférence de langue perso (§4). null/absent = non exprimée (le front suit son localStorage). */
  langue?: 'FR' | 'EN' | null
  /** Devise de l'organisation (§5, immuable) → formatage des montants (F6). null pour le SUPER_ADMIN. */
  devise?: 'FCFA' | 'EUR' | 'USD' | 'CAD' | null
  /** Nom de l'organisation d'appartenance → mis en relief en tête d'interface. null pour le SUPER_ADMIN. */
  nomOrganisation?: string | null
}

/** Réponse de PATCH /auth/me/langue : nouveau token (portant la langue) + langue enregistrée. */
export interface LangueResponse {
  accessToken: string
  langue: 'FR' | 'EN'
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

/** Auto-inscription (§3.1) : création d'une organisation + son admin fondateur. */
export interface InscriptionInput {
  nomOrganisation: string
  devise: 'FCFA' | 'EUR' | 'USD' | 'CAD'
  langue: 'FR' | 'EN'
  email: string
  password: string
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

/**
 * Traduit une erreur d'appel API en message lisible pour l'UI.
 *
 * - `ApiError` (le serveur A répondu, avec un statut d'erreur) → message du serveur.
 * - Sinon, `fetch` a **rejeté** sans réponse : réseau coupé, serveur injoignable, ou —
 *   cas fréquent — requête **bloquée par la politique CORS** (origine non autorisée).
 *   On loggue l'erreur brute (diagnostic) et on renvoie un message explicite plutôt
 *   qu'un « Erreur de chargement » opaque.
 */
export function messageErreur(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof DOMException && e.name === 'AbortError') return 'Requête annulée.'
  // eslint-disable-next-line no-console
  console.error('[NKONI] Appel API en échec (réseau ou CORS/origine non autorisée) :', e)
  return 'Impossible de contacter le serveur (réseau, ou origine non autorisée par le CORS).'
}

/* -------------------------------------------------------------------------- */
/* Rafraîchissement silencieux du token (refresh-on-401)                       */
/* -------------------------------------------------------------------------- */

/**
 * Pont entre le client HTTP (module, hors React) et `AuthContext`. Ce dernier enregistre ses
 * callbacks au montage ; le client s'en sert pour propager un access token rafraîchi et pour
 * déclencher une déconnexion propre quand le refresh échoue.
 */
interface AuthBridge {
  /** Un nouvel access token vient d'être obtenu → AuthContext remplace le sien (setState). */
  onTokenRefreshed?: (accessToken: string) => void
  /** Le refresh a échoué (cookie expiré/absent) → AuthContext vide la session (→ /login). */
  onSessionExpired?: () => void
}
const authBridge: AuthBridge = {}
export function configurerAuthBridge(bridge: AuthBridge): void {
  authBridge.onTokenRefreshed = bridge.onTokenRefreshed
  authBridge.onSessionExpired = bridge.onSessionExpired
}

/**
 * Rafraîchit l'access token via le cookie refresh (POST /auth/refresh), en DÉDUPLIQUANT les
 * appels concurrents : si plusieurs requêtes tombent en 401 en même temps, un SEUL /auth/refresh
 * part et toutes attendent le même résultat (pas de rafale). Retourne le nouveau token, ou `null`
 * si le refresh échoue. Exposée pour permettre aussi un refresh PROACTIF (avant expiration).
 */
let refreshEnCours: Promise<string | null> | null = null
export function rafraichirAccessToken(): Promise<string | null> {
  if (!refreshEnCours) {
    refreshEnCours = fetchRefresh()
      .then((token) => {
        authBridge.onTokenRefreshed?.(token)
        return token
      })
      .catch(() => null)
      .finally(() => {
        refreshEnCours = null
      })
  }
  return refreshEnCours
}

/** Appel brut à /auth/refresh (hors `request`, donc jamais soumis à la logique de retry). */
async function fetchRefresh(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new ApiError(res.status, 'refresh échoué')
  const data = (await res.json()) as RefreshResponse
  return data.accessToken
}

interface RequestOptions {
  method?: string
  json?: unknown
  accessToken?: string | null
  signal?: AbortSignal
  /** Clé d'idempotence (§ PWA hors-ligne) → en-tête `Idempotence-Key` (rejeu sans doublon). */
  cleIdempotence?: string
  /** Interne : passe à false sur la requête REJOUÉE pour interdire une seconde tentative (anti-boucle). */
  permettreRetry?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, accessToken, signal, permettreRetry = true, cleIdempotence } = options

  const headers: Record<string, string> = {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  if (cleIdempotence) headers['Idempotence-Key'] = cleIdempotence

  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
    signal,
  })

  // Refresh-on-401 : un access token expiré → on tente UN refresh silencieux (dédupliqué) puis on
  // rejoue la requête UNE fois avec le nouveau token. Conditions strictes anti-boucle :
  //   - `permettreRetry` (déjà false sur la requête rejouée),
  //   - `accessToken != null` : un flux public (login/inscription/refresh) n'est jamais rejoué.
  if (res.status === 401 && permettreRetry && accessToken != null) {
    const nouveauToken = await rafraichirAccessToken()
    if (nouveauToken) {
      return request<T>(path, { ...options, accessToken: nouveauToken, permettreRetry: false })
    }
    // Refresh impossible → session terminée : déconnexion propre (AuthContext videra l'état,
    // ProtectedRoute redirige vers /login). On laisse ensuite l'erreur 401 se propager.
    authBridge.onSessionExpired?.()
  }

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

/* -------------------------------------------------------------------------- */
/* Helpers partagés (identifiants d'URL, gestion d'erreurs binaires)          */
/* -------------------------------------------------------------------------- */

/** Encode un identifiant pour l'insérer sans risque dans un chemin d'URL. */
export const rid = (id: string) => encodeURIComponent(id)

/** Extrait un message d'erreur d'une réponse fetch non-ok et lève une ApiError. */
export async function leverSiErreur(res: Response): Promise<void> {
  if (res.ok) return
  let message = `Erreur ${res.status}`
  try {
    const data = (await res.json()) as { message?: string }
    if (data?.message) message = data.message
  } catch {
    /* pas de corps JSON */
  }
  throw new ApiError(res.status, message)
}

/** Extrait le nom de fichier d'un en-tête `Content-Disposition`. */
export function nomFichierDepuisDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const match = /filename="?([^"]+)"?/.exec(disposition)
  return match ? match[1] : null
}
