// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthContext'
import { useAuth } from './auth-context'

/**
 * AuthContext en mode démo (spec 2026-09-15 §2.2). Invariant NON NÉGOCIABLE : quitter la démo, par
 * quelque chemin que ce soit, n'appelle jamais /auth/logout et ne purge jamais la file hors-ligne —
 * l'administrateur réel qui a ouvert la démo dans ce navigateur doit retrouver sa session intacte.
 */

const api = vi.hoisted(() => ({
  refresh: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
  setLangue: vi.fn(),
  login: vi.fn(),
  inscription: vi.fn(),
  ouvrirSessionDemo: vi.fn(),
  definirModeDemo: vi.fn(),
  rafraichirAccessToken: vi.fn(),
  bridge: {} as { onTokenRefreshed?: (t: string) => void; onSessionExpired?: () => void },
}))
vi.mock('@/lib/api', () => ({
  authApi: {
    refresh: api.refresh,
    me: api.me,
    logout: api.logout,
    setLangue: api.setLangue,
    login: api.login,
    inscription: api.inscription,
  },
  ouvrirSessionDemo: api.ouvrirSessionDemo,
  definirModeDemo: api.definirModeDemo,
  rafraichirAccessToken: api.rafraichirAccessToken,
  configurerAuthBridge: (b: typeof api.bridge) => Object.assign(api.bridge, b),
}))
const appliquerLangue = vi.fn()
vi.mock('@/lib/i18n', () => ({ default: { t: (cle: string) => cle }, appliquerLangue: (l: string) => appliquerLangue(l) }))
vi.mock('@/lib/format', () => ({ appliquerDevise: vi.fn() }))
const purgerDonneesLocales = vi.fn(async () => undefined)
const purgerCachesApi = vi.fn(async () => undefined)
vi.mock('@/lib/offline-queue', () => ({
  purgerDonneesLocales: () => purgerDonneesLocales(),
  purgerCachesApi: () => purgerCachesApi(),
}))

const ADMIN_REEL = { id: 'u-reel', email: 'admin@asso.cm', role: 'ADMIN', langue: 'FR' as const }
const ADMIN_DEMO = { id: 'u-demo', email: 'admin@demo.nkoni.invalid', role: 'ADMIN', membreId: 'm-president' }

let ctx: ReturnType<typeof useAuth>
function Sonde() {
  ctx = useAuth()
  return (
    <p data-testid="etat">
      {`${ctx.loading ? 'chargement' : 'pret'}|${ctx.modeDemo ? 'demo' : 'reel'}|${ctx.user?.id ?? 'aucun'}|${ctx.accessToken ?? 'sans-jeton'}`}
    </p>
  )
}
const etat = () => screen.getByTestId('etat').textContent

async function monter() {
  render(
    <AuthProvider>
      <Sonde />
    </AuthProvider>,
  )
  await waitFor(() => expect(etat()).toMatch(/^pret\|/))
}

/** Session réelle présente dans le cookie (administrateur connecté dans ce navigateur). */
function sessionReelle() {
  api.refresh.mockResolvedValue({ accessToken: 'jeton-reel' })
  api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))
}
function sansSessionReelle() {
  api.refresh.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }))
  api.me.mockImplementation(async () => ADMIN_DEMO)
}

beforeEach(() => {
  for (const f of [api.refresh, api.me, api.logout, api.setLangue, api.ouvrirSessionDemo, api.definirModeDemo, api.rafraichirAccessToken]) f.mockReset()
  api.bridge.onTokenRefreshed = undefined
  api.bridge.onSessionExpired = undefined
  appliquerLangue.mockReset()
  purgerDonneesLocales.mockClear()
  purgerCachesApi.mockClear()
  api.ouvrirSessionDemo.mockResolvedValue({ accessToken: 'jeton-demo', user: { id: 'u-demo', role: 'ADMIN' } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AuthContext — entrer dans la démo', () => {
  it('pose le mode démo AVANT de lire le profil, puis bascule jeton et utilisateur', async () => {
    sessionReelle()
    await monter()
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')

    await act(async () => {
      await ctx.demarrerDemo()
    })

    expect(etat()).toBe('pret|demo|u-demo|jeton-demo')
    expect(api.definirModeDemo).toHaveBeenCalledWith(expect.objectContaining({ messageRefus: expect.any(Function) }))
    const ordreMode = api.definirModeDemo.mock.invocationCallOrder[0]
    const ordreMe = api.me.mock.invocationCallOrder.at(-1) ?? 0
    expect(ordreMode).toBeLessThan(ordreMe)
    expect(purgerCachesApi).toHaveBeenCalled()
  })

  it('démo indisponible (404) : état réel intact, mode démo retiré, erreur remontée', async () => {
    sessionReelle()
    await monter()
    api.ouvrirSessionDemo.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }))

    await act(async () => {
      await expect(ctx.demarrerDemo()).rejects.toMatchObject({ status: 404 })
    })

    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
    expect(api.definirModeDemo).not.toHaveBeenCalledWith(expect.objectContaining({ messageRefus: expect.any(Function) }))
  })
})

describe("AuthContext — quitter la démo n'appelle jamais /auth/logout", () => {
  it("Quitter la démo n'appelle jamais /auth/logout : l'administrateur réel retrouve sa session", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    let reel: unknown
    await act(async () => {
      reel = await ctx.quitterDemo()
    })

    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
    expect(api.definirModeDemo).toHaveBeenLastCalledWith(null)
    expect(reel).toEqual(ADMIN_REEL)
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it("« Se déconnecter » en démo n'appelle jamais /auth/logout : il quitte la démo", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    await act(async () => {
      await ctx.logout()
    })

    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it("échec du renouvellement démo : sortie de la démo, jamais /auth/logout", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    await act(async () => {
      api.bridge.onSessionExpired?.()
    })

    await waitFor(() => expect(etat()).toBe('pret|reel|u-reel|jeton-reel'))
    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
  })

  it('visiteur sans compte : quitter renvoie null et laisse la session vide', async () => {
    sansSessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    let reel: unknown = 'non-appele'
    await act(async () => {
      reel = await ctx.quitterDemo()
    })

    expect(reel).toBeNull()
    expect(etat()).toBe('pret|reel|aucun|sans-jeton')
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('hors démo, logout garde son comportement (appel serveur + purge locale)', async () => {
    sessionReelle()
    api.logout.mockResolvedValue(undefined)
    await monter()
    await act(async () => {
      await ctx.logout()
    })
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(purgerDonneesLocales).toHaveBeenCalledTimes(1)
  })
})

describe('AuthContext — autres comportements en démo', () => {
  it('changer de langue : application locale, aucun PATCH /auth/me/langue', async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })
    appliquerLangue.mockReset()

    await act(async () => {
      await ctx.changerLangue('EN')
    })

    expect(api.setLangue).not.toHaveBeenCalled()
    expect(appliquerLangue).toHaveBeenCalledWith('EN')
  })

  it('aucun refresh proactif programmé pendant la démo', async () => {
    sansSessionReelle()
    await monter()
    const exp = Math.floor(Date.now() / 1000) + 61 // échéance à ~1 s du déclenchement proactif
    const jeton = `x.${btoa(JSON.stringify({ exp }))}.y`
    api.ouvrirSessionDemo.mockResolvedValue({ accessToken: jeton, user: {} })
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await act(async () => {
      await ctx.demarrerDemo()
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    expect(api.rafraichirAccessToken).not.toHaveBeenCalled()
  })

  it('une réhydratation réelle qui aboutit APRÈS le début de la démo ne l’écrase pas', async () => {
    let repondre: (v: { accessToken: string }) => void = () => undefined
    api.refresh.mockImplementation(
      () =>
        new Promise((r) => {
          repondre = r
        }),
    )
    api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))
    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )

    await act(async () => {
      await ctx.demarrerDemo()
    })
    await act(async () => {
      repondre({ accessToken: 'jeton-reel' })
    })

    await waitFor(() => expect(etat()).toBe('pret|demo|u-demo|jeton-demo'))
  })
})
