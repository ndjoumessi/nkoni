import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  ENTETE_DEMO,
  authApi,
  configurerAuthBridge,
  definirModeDemo,
  documentsApi,
  equilibragesApi,
  estModeDemo,
  membresApi,
  moiApi,
  ouvrirSessionDemo,
  rafraichirAccessToken,
  recusApi,
  reunionsApi,
  versementsApi,
} from './api'

/**
 * Client HTTP en MODE DÉMO (spec 2026-09-15 §2.2 et §2.4) — `fetch` mocké, env `node`.
 * Invariants : aucune écriture ne part (sauf la simulation d'équilibrage), aucun /auth/refresh
 * (il restaurerait la session RÉELLE depuis le cookie), jamais de /auth/logout.
 */

type FetchInit = { method?: string; headers?: Record<string, string>; credentials?: string }
type FetchCall = { url: string; method: string; auth?: string; credentials?: string; demo?: string }
const calls: FetchCall[] = []
const fetchOriginal = globalThis.fetch

function monterFetch(handler: (call: FetchCall) => Response | Promise<Response>): void {
  calls.length = 0
  globalThis.fetch = vi.fn(async (input: unknown, init?: unknown) => {
    const i = (init ?? {}) as FetchInit
    const call: FetchCall = {
      url: String(input),
      method: i.method ?? 'GET',
      auth: i.headers?.Authorization,
      credentials: i.credentials,
      demo: i.headers?.['X-Nkoni-Demo'],
    }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const trace = () => calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)
const MESSAGE = 'Démo en lecture seule'
const activerDemo = () => definirModeDemo({ messageRefus: () => MESSAGE })

beforeEach(() => {
  configurerAuthBridge({})
  definirModeDemo(null)
})
afterEach(() => {
  definirModeDemo(null)
  vi.restoreAllMocks()
  globalThis.fetch = fetchOriginal
})

describe('mode démo — refus local des écritures', () => {
  it('une écriture est refusée localement (403, message traduit) sans appel réseau', async () => {
    monterFetch(() => json(201, {}))
    activerDemo()
    expect(estModeDemo()).toBe(true)
    const promesse = versementsApi.create({} as never, 'jeton-demo')
    await expect(promesse).rejects.toBeInstanceOf(ApiError)
    await expect(promesse).rejects.toMatchObject({ status: 403, message: MESSAGE })
    expect(calls).toHaveLength(0)
  })

  it('POST /equilibrages/simuler part (seule exception)', async () => {
    monterFetch(() => json(200, { membreId: 'm1' }))
    activerDemo()
    await equilibragesApi.simuler({ membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 }, 'jeton-demo')
    expect(trace()).toEqual(['POST /equilibrages/simuler'])
  })

  it("authApi.logout est refusé localement : n'appelle jamais /auth/logout", async () => {
    monterFetch(() => new Response(null, { status: 204 }))
    activerDemo()
    await expect(authApi.logout()).rejects.toMatchObject({ status: 403 })
    expect(calls).toHaveLength(0)
  })

  it('les téléversements multipart (fetch bruts) sont refusés sans appel réseau', async () => {
    monterFetch(() => json(200, {}))
    activerDemo()
    const fichier = new File(['x'], 'a.png', { type: 'image/png' })
    const appels = [
      () => membresApi.uploadPhoto('m1', fichier, 'j'),
      () => membresApi.parserFichier(fichier, 'j'),
      () => documentsApi.upload({ entiteType: 'MEMBRE', entiteId: 'm1', nom: 'a', file: fichier } as never, 'j'),
      () => moiApi.televerserPhoto(fichier, 'j'),
      () => moiApi.televerserAvatar(fichier, 'j'),
    ]
    for (const appel of appels) {
      await expect(appel()).rejects.toMatchObject({ status: 403, message: MESSAGE })
    }
    expect(calls).toHaveLength(0)
  })

  it('hors mode démo : comportement inchangé, l’écriture part', async () => {
    monterFetch(() => json(201, { id: 'v1' }))
    await versementsApi.create({} as never, 'jeton-reel')
    expect(trace()).toEqual(['POST /versements'])
  })
})

describe('mode démo — expiration du jeton', () => {
  it('401 → nouvelle session démo (jamais /auth/refresh) puis rejeu avec le nouveau jeton', async () => {
    monterFetch((c) => {
      if (c.url.endsWith('/demo/session')) return json(200, { accessToken: 'demo-neuf', user: {} })
      if (c.auth === 'Bearer demo-neuf') return json(200, [{ id: 'r1' }])
      return json(401, { message: 'expiré' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })
    activerDemo()

    expect(await reunionsApi.list('demo-expire')).toEqual([{ id: 'r1' }])
    expect(trace()).toEqual(['GET /reunions', 'POST /demo/session', 'GET /reunions'])
    expect(onTokenRefreshed).toHaveBeenCalledWith('demo-neuf')
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('renouvellement en échec (démo éteinte) → onSessionExpired, pas de boucle', async () => {
    monterFetch((c) =>
      c.url.endsWith('/demo/session') ? json(404, { message: 'indisponible' }) : json(401, { message: 'expiré' }),
    )
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onSessionExpired })
    activerDemo()

    await expect(reunionsApi.list('demo-expire')).rejects.toMatchObject({ status: 401 })
    expect(trace()).toEqual(['GET /reunions', 'POST /demo/session'])
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('rafraichirAccessToken en mode démo ne touche jamais /auth/refresh', async () => {
    monterFetch((c) =>
      c.url.endsWith('/demo/session') ? json(200, { accessToken: 'demo-2', user: {} }) : json(200, { accessToken: 'reel' }),
    )
    activerDemo()
    expect(await rafraichirAccessToken()).toBe('demo-2')
    expect(trace()).toEqual(['POST /demo/session'])
  })

  it('un refresh RÉEL en vol au démarrage de la démo ne propage pas son jeton', async () => {
    let repondre: (r: Response) => void = () => undefined
    monterFetch((c) =>
      c.url.endsWith('/auth/refresh')
        ? new Promise<Response>((r) => {
            repondre = r
          })
        : json(200, {}),
    )
    const onTokenRefreshed = vi.fn()
    configurerAuthBridge({ onTokenRefreshed })

    const enVol = rafraichirAccessToken() // session réelle
    activerDemo() // la démo démarre pendant ce temps
    repondre(json(200, { accessToken: 'jeton-reel' }))

    expect(await enVol).toBeNull()
    expect(onTokenRefreshed).not.toHaveBeenCalled()
  })

  it('401 via request() + refresh en vol devenu obsolète (démo démarrée entre-temps) : 401 propage, sans vider la session', async () => {
    let repondreRefresh: (r: Response) => void = () => undefined
    monterFetch((c) => {
      if (c.url.endsWith('/auth/refresh')) {
        activerDemo() // la démo démarre PENDANT ce refresh réel, encore en vol
        return new Promise<Response>((r) => {
          repondreRefresh = r
        })
      }
      return json(401, { message: 'expiré' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })

    const promesse = reunionsApi.list('jeton-reel') // session RÉELLE, pas encore en démo
    await Promise.resolve() // laisse /reunions (401) puis /auth/refresh partir
    repondreRefresh(json(200, { accessToken: 'jeton-reel-2' }))

    await expect(promesse).rejects.toMatchObject({ status: 401 })
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(onTokenRefreshed).not.toHaveBeenCalled()
  })
})

describe('revue I1 — 401 d’une requête émise sous une AUTRE génération de session', () => {
  it('GET émis en démo, sortie de démo pendant le vol, 401 ensuite : aucun /auth/refresh, session intacte', async () => {
    // Sans capture AVANT l'envoi : la génération lue au 401 est déjà celle de la session réelle,
    // `modeDemo` est null → /auth/refresh partirait EN PLUS de celui de la sortie, avec le même
    // cookie → détection de réutilisation serveur → famille de l'administrateur réel révoquée.
    let repondreGet: (r: Response) => void = () => undefined
    let getsEmis = 0
    monterFetch((c) => {
      if (c.url.endsWith('/reunions') && getsEmis++ > 0) return json(200, [])
      if (c.url.endsWith('/reunions')) {
        return new Promise<Response>((r) => {
          repondreGet = r
        })
      }
      return json(200, { accessToken: 'jeton-reel' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })
    activerDemo()

    const promesse = reunionsApi.list('jeton-demo-expire')
    await Promise.resolve()
    definirModeDemo(null) // « Quitter la démo » pendant que le GET est en vol
    repondreGet(json(401, { message: 'expiré' }))

    await expect(promesse).rejects.toMatchObject({ status: 401 })
    expect(trace()).toEqual(['GET /reunions'])
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(onTokenRefreshed).not.toHaveBeenCalled()
  })
})

describe('revue I2 — en-tête X-Nkoni-Demo (exclusion du cache du service worker)', () => {
  it('en démo, request() et les GET binaires bruts portent X-Nkoni-Demo: 1', async () => {
    monterFetch(() => new Response('[]', { status: 200 }))
    activerDemo()
    await reunionsApi.list('jeton-demo')
    await recusApi.telecharger('r1', 'jeton-demo')
    expect(calls.map((c) => c.demo)).toEqual(['1', '1'])
  })

  it('hors démo : aucun en-tête démo (lectures réelles toujours mises en cache hors-ligne)', async () => {
    monterFetch(() => new Response('[]', { status: 200 }))
    await reunionsApi.list('jeton-reel')
    await recusApi.telecharger('r1', 'jeton-reel')
    expect(calls.map((c) => c.demo)).toEqual([undefined, undefined])
  })

  const ICI = dirname(fileURLToPath(import.meta.url))

  it('GARDE : tout fetch brut authentifié du client étale entetesDemo()', () => {
    const dossier = resolve(ICI, 'api')
    let inspectes = 0
    for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.ts') && n !== 'core.ts')) {
      const lignes = readFileSync(resolve(dossier, nom), 'utf8').split('\n')
      for (const [i, ligne] of lignes.entries()) {
        if (!ligne.includes('Authorization:')) continue
        inspectes++
        expect(ligne.includes('...entetesDemo()'), `${nom}:${i + 1} sans entetesDemo()`).toBe(true)
      }
    }
    expect(inspectes).toBeGreaterThan(0) // jamais vacant
  })

  it('GARDE : le service worker exclut exactement cet en-tête de son cache', () => {
    const config = readFileSync(resolve(ICI, '../../vite.config.ts'), 'utf8')
    expect(ENTETE_DEMO).toBe('X-Nkoni-Demo')
    expect(config).toContain(`request.headers.get('${ENTETE_DEMO}') !== '1'`)
  })
})

describe('ouvrirSessionDemo', () => {
  it('POST /demo/session sans cookie (credentials omit) → jeton et utilisateur', async () => {
    monterFetch(() => json(200, { accessToken: 'demo-1', user: { id: 'u1', role: 'ADMIN' } }))
    const session = await ouvrirSessionDemo()
    expect(session.accessToken).toBe('demo-1')
    expect(trace()).toEqual(['POST /demo/session'])
    expect(calls[0].credentials).toBe('omit')
  })

  it('404 → ApiError 404 (démo indisponible)', async () => {
    monterFetch(() => json(404, { message: 'indisponible' }))
    await expect(ouvrirSessionDemo()).rejects.toMatchObject({ status: 404 })
  })
})
