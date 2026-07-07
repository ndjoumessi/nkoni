import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reunionsApi, configurerAuthBridge, ApiError } from './api'

/**
 * Client HTTP — refresh-on-401 silencieux (feat/refresh-token).
 * `fetch` est mocké : on pilote les réponses par (url, token) et on compte les appels.
 */

type FetchInit = { method?: string; headers?: Record<string, string> }
type FetchCall = { url: string; method: string; auth?: string }

const calls: FetchCall[] = []

/** Installe un mock de fetch pilotable et enregistre chaque appel (url/méthode/token). */
function monterFetch(handler: (call: FetchCall) => Response): void {
  calls.length = 0
  globalThis.fetch = vi.fn(async (input: unknown, init?: unknown) => {
    const url = String(input)
    const i = (init ?? {}) as FetchInit
    const call: FetchCall = { url, method: i.method ?? 'GET', auth: i.headers?.Authorization }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

const tick = () => new Promise((r) => setTimeout(r, 5))

beforeEach(() => {
  configurerAuthBridge({}) // repart de callbacks vierges
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refresh-on-401 du client HTTP', () => {
  it('token expiré → refresh auto → requête rejouée avec succès (aucune erreur visible)', async () => {
    monterFetch((c) => {
      if (c.url.endsWith('/auth/refresh')) return json(200, { accessToken: 'token-neuf' })
      // /reunions : 401 avec l'ancien token, 200 avec le neuf.
      if (c.auth === 'Bearer token-neuf') return json(200, [{ id: 'r1' }])
      return json(401, { message: 'Token JWT absent ou invalide.' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })

    const data = await reunionsApi.list('token-expire')

    expect(data).toEqual([{ id: 'r1' }])
    // Le nouveau token est propagé à AuthContext, aucune déconnexion.
    expect(onTokenRefreshed).toHaveBeenCalledWith('token-neuf')
    expect(onSessionExpired).not.toHaveBeenCalled()
    // GET(401) → POST /auth/refresh(200) → GET rejoué(200).
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'GET /reunions',
      'POST /auth/refresh',
      'GET /reunions',
    ])
    // La requête rejouée porte bien le nouveau token.
    expect(calls[2].auth).toBe('Bearer token-neuf')
  })

  it('refresh qui échoue aussi (cookie expiré/absent) → déconnexion propre, pas de boucle', async () => {
    monterFetch((c) => {
      if (c.url.endsWith('/auth/refresh')) return json(401, { message: 'refresh invalide' })
      return json(401, { message: 'Token JWT absent ou invalide.' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })

    await expect(reunionsApi.list('token-expire')).rejects.toBeInstanceOf(ApiError)

    expect(onSessionExpired).toHaveBeenCalledTimes(1)
    expect(onTokenRefreshed).not.toHaveBeenCalled()
    // Exactement 2 appels : la requête (401) + UN refresh (401). Pas de nouvelle tentative → pas de boucle.
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/reunions', '/auth/refresh'])
  })

  it('plusieurs requêtes en 401 simultanées → un SEUL /auth/refresh (dédup, pas de rafale)', async () => {
    let refreshCount = 0
    monterFetch((c) => {
      if (c.url.endsWith('/auth/refresh')) {
        refreshCount += 1
        return json(200, { accessToken: 'token-neuf' })
      }
      if (c.auth === 'Bearer token-neuf') return json(200, [{ id: 'ok' }])
      return json(401, { message: 'Token JWT absent ou invalide.' })
    })
    // Ralentit /auth/refresh pour que les 3 requêtes atteignent le refresh pendant qu'il est en vol.
    const brut = globalThis.fetch
    globalThis.fetch = (async (input: unknown, init?: unknown) => {
      if (String(input).endsWith('/auth/refresh')) await tick()
      return brut(input as RequestInfo, init as RequestInit)
    }) as unknown as typeof fetch
    configurerAuthBridge({ onTokenRefreshed: vi.fn(), onSessionExpired: vi.fn() })

    const resultats = await Promise.all([
      reunionsApi.list('token-expire'),
      reunionsApi.list('token-expire'),
      reunionsApi.list('token-expire'),
    ])

    expect(refreshCount).toBe(1) // dédup : un seul refresh malgré 3 requêtes concurrentes
    for (const r of resultats) expect(r).toEqual([{ id: 'ok' }])
  })
})
