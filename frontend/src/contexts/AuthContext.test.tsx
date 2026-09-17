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
  // Revue (Minor 5) : un `mockReset()` renvoie `undefined` par défaut — un sabotage qui ajoute un
  // appel à `authApi.logout()` doit échouer sur `.not.toHaveBeenCalled()`, pas sur un TypeError
  // (`undefined.catch is not a function`) qui masquerait l'assertion visée.
  api.logout.mockResolvedValue(undefined)
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

  it("démo ouverte mais /auth/me échoue pour le jeton démo : mode retiré (branche de rollback), état réel intact", async () => {
    // Distinct du test 404 ci-dessus : là, `ouvrirSessionDemo` rejette AVANT que `definirModeDemo`
    // ne pose le mode — la branche `catch` de `demarrerDemo` (rollback APRÈS avoir posé le mode)
    // n'est jamais exercée. Ici `ouvrirSessionDemo` réussit, c'est `authApi.me` qui échoue.
    sessionReelle()
    await monter()
    api.me.mockImplementation(async (jeton: string) => {
      if (jeton === 'jeton-demo') throw new Error('me a échoué')
      return ADMIN_REEL
    })

    await act(async () => {
      await expect(ctx.demarrerDemo()).rejects.toThrow('me a échoué')
    })

    expect(api.definirModeDemo).toHaveBeenLastCalledWith(null)
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
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

describe('AuthContext — concurrence des sorties de démo (revue)', () => {
  it('deux sorties concurrentes (quitterDemo + logout) ne déclenchent qu’un seul /auth/refresh, jamais /auth/logout', async () => {
    // Sans single-flight, le second refresh présenterait un `jti` déjà tourné par le premier :
    // la détection de réutilisation du serveur révoquerait TOUTE la famille de l'administrateur réel
    // (backend/src/routes/auth.route.ts). Ordre d'appel volontaire : `quitterDemo()` a déjà mis
    // `modeDemoRef` à false par le temps où `logout()` fait son propre test — `logout` doit donc
    // aussi router vers la sortie PARTAGÉE (via `sortieEnCoursRef`), pas retomber sur /auth/logout.
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    const appelsRefreshAvant = api.refresh.mock.calls.length
    await act(async () => {
      await Promise.all([ctx.quitterDemo(), ctx.logout()])
    })

    expect(api.refresh.mock.calls.length - appelsRefreshAvant).toBe(1)
    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it('double appel direct à quitterDemo() (double clic) : un seul /auth/refresh', async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    const appelsRefreshAvant = api.refresh.mock.calls.length
    await act(async () => {
      await Promise.all([ctx.quitterDemo(), ctx.quitterDemo()])
    })

    expect(api.refresh.mock.calls.length - appelsRefreshAvant).toBe(1)
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it("démo entrée pendant l'hydratation de montage encore en vol : la sortie réutilise LE MÊME refresh", async () => {
    let repondreRefresh: (v: { accessToken: string }) => void = () => undefined
    api.refresh.mockImplementation(
      () =>
        new Promise((r) => {
          repondreRefresh = r
        }),
    )
    api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))
    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )
    // L'hydratation de montage a déjà appelé /auth/refresh (1 appel), jamais résolu pour l'instant.

    await act(async () => {
      await ctx.demarrerDemo()
    })
    // L'hydratation de montage n'a pas encore résolu : `loading` reste `true` (comme dans le test
    // « une réhydratation réelle… » ci-dessous) — seuls le mode/jeton/utilisateur démo sont vérifiés ici.
    expect(etat()).toMatch(/\|demo\|u-demo\|jeton-demo$/)

    let sortiePromise!: Promise<unknown>
    act(() => {
      sortiePromise = ctx.quitterDemo()
    })
    // La sortie doit avoir réutilisé le refresh de montage, pas en avoir relancé un second.
    expect(api.refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      repondreRefresh({ accessToken: 'jeton-reel' })
      await sortiePromise
    })

    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it('démo réentrée pendant que le refresh de sortie est en vol : ne jamais écraser la démo en cours', async () => {
    let repondreSortie: (v: { accessToken: string }) => void = () => undefined
    api.refresh
      .mockResolvedValueOnce({ accessToken: 'jeton-reel' }) // hydratation de montage
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            repondreSortie = r
          }),
      ) // refresh de la sortie, différé
    api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))

    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })
    expect(etat()).toBe('pret|demo|u-demo|jeton-demo')

    let sortiePromise!: Promise<unknown>
    act(() => {
      sortiePromise = ctx.quitterDemo()
    })

    // La démo est RÉENTRÉE pendant que le refresh de sortie ci-dessus est encore en vol.
    await act(async () => {
      await ctx.demarrerDemo()
    })

    await act(async () => {
      repondreSortie({ accessToken: 'jeton-reel' })
      await sortiePromise
    })

    // La session réelle, revenue APRÈS la ré-entrée en démo, ne doit jamais l'écraser (spec §0 :
    // jamais de données réelles mélangées sous la bannière démo).
    expect(etat()).toBe('pret|demo|u-demo|jeton-demo')
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

  it('revue M2 : le minuteur proactif du jeton RÉEL ne tire rien pendant l’entrée en démo', async () => {
    // Échéance proactive LOINTAINE (10 min) : avec `shouldAdvanceTime`, le temps simulé avance aussi au
    // rythme réel. Une échéance à ~1 s (ancienne version, `floor(now) + 61` → délai de 0 à 1000 ms selon
    // la milliseconde courante) laissait le minuteur du jeton réel tirer LÉGITIMEMENT pendant le montage
    // sur une CI lente, avant l'entrée en démo → échec intermittent. Ici rien ne peut tirer d'ici
    // l'avance EXPLICITE ci-dessous, faite une fois la démo engagée.
    const DELAI_PROACTIF_MS = 10 * 60_000
    const exp = Math.floor((Date.now() + 60_000 + DELAI_PROACTIF_MS) / 1000)
    const jetonReel = `x.${btoa(JSON.stringify({ exp }))}.y`
    api.refresh.mockResolvedValue({ accessToken: jetonReel })
    let repondreMeDemo: (u: typeof ADMIN_DEMO) => void = () => undefined
    api.me.mockImplementation((jeton: string) =>
      jeton === 'jeton-demo'
        ? new Promise((r) => {
            repondreMeDemo = r
          })
        : Promise.resolve(ADMIN_REEL),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await monter()
    // `waitFor` voit le DOM commité avant que les effets passifs (armement du minuteur) ne soient
    // vidés : on les vide explicitement avant de compter les minuteurs.
    await act(async () => {})
    // Contrôle anti-vacuité : session réelle installée, minuteur armé, rien n'a encore tiré.
    expect(etat()).toBe(`pret|reel|u-reel|${jetonReel}`)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    expect(api.rafraichirAccessToken).not.toHaveBeenCalled()

    // Entrée en démo : mode posé, /auth/me démo encore en vol → `modeDemo` (état) toujours false,
    // donc l'effet n'a PAS désarmé le minuteur : seule la garde `modeDemoRef` l'empêche d'agir.
    let entree!: Promise<unknown>
    act(() => {
      entree = ctx.demarrerDemo()
    })
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(DELAI_PROACTIF_MS + 5_000) // franchit l'échéance proactive
    })
    expect(etat()).toMatch(/\|reel\|/) // toujours en cours d'entrée : le minuteur réel était encore armé
    expect(api.rafraichirAccessToken).not.toHaveBeenCalled()

    await act(async () => {
      repondreMeDemo(ADMIN_DEMO)
      await entree
    })
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
