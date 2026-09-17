// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppShell } from '@/components/AppShell'
import DemoPage from '@/pages/DemoPage'
import SortieDemoPage from '@/pages/SortieDemoPage'
import { definirModeDemo } from '@/lib/api'

/**
 * SORTIE DE DÉMO DE BOUT EN BOUT (revue finale PR 3, C1) — VRAI `AuthProvider`, VRAI `ProtectedRoute`,
 * VRAIE coquille `AppShell`, vraies routes dans un `MemoryRouter` ; SEUL `fetch` est simulé (par URL).
 *
 * Défaut couvert : quitter depuis la coquille vidait la session (`user=null`, `loading=true`) puis
 * naviguait. `setLoading(false)` était rendu AVANT le changement de location (poussé par le routeur
 * dans une transition) → `ProtectedRoute` rendait `<Navigate to="/login">`, dont l'effet écrasait la
 * destination. L'écrasement est TARDIF : on réasserte après un tour de macrotâche.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/lib/i18n', () => ({ default: { t: (cle: string) => cle }, appliquerLangue: () => {} }))

const ADMIN_DEMO = { id: 'u-demo', email: 'admin@demo.nkoni.invalid', role: 'ADMIN', membreId: 'm-president' }
const ADMIN_REEL = { id: 'u-reel', email: 'admin@asso.cm', role: 'ADMIN' }

type Appel = { methode: string; chemin: string; auth?: string }
const appels: Appel[] = []
const fetchOriginal = globalThis.fetch

const json = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })

function monterFetch(sessionReelle: boolean) {
  appels.length = 0
  globalThis.fetch = vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = new URL(String(entree))
    const entetes = (init?.headers ?? {}) as Record<string, string>
    const appel: Appel = { methode: init?.method ?? 'GET', chemin: url.pathname, auth: entetes.Authorization }
    appels.push(appel)
    if (appel.methode === 'POST' && appel.chemin === '/demo/session') {
      return json(200, { accessToken: 'jeton-demo', user: ADMIN_DEMO })
    }
    if (appel.methode === 'POST' && appel.chemin === '/auth/refresh') {
      return sessionReelle ? json(200, { accessToken: 'jeton-reel' }) : json(401, { message: 'absent' })
    }
    if (appel.chemin === '/auth/me') {
      if (appel.auth === 'Bearer jeton-demo') return json(200, ADMIN_DEMO)
      if (appel.auth === 'Bearer jeton-reel') return json(200, ADMIN_REEL)
      return json(401, { message: 'non authentifié' })
    }
    return json(404, { message: 'inconnu' })
  }) as unknown as typeof fetch
}

const compter = (methode: string, chemin: string) =>
  appels.filter((a) => a.methode === methode && a.chemin === chemin).length

function Sonde() {
  const { pathname } = useLocation()
  return <p data-testid="location">{pathname}</p>
}

function Coquille() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  )
}

function monter() {
  render(
    <MemoryRouter initialEntries={['/demo']}>
      <AuthProvider>
        <Sonde />
        <Routes>
          <Route path="/" element={<p>accueil</p>} />
          <Route path="/login" element={<p>connexion</p>} />
          <Route path="/inscription" element={<p>inscription</p>} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/demo/sortie" element={<SortieDemoPage />} />
          <Route element={<Coquille />}>
            <Route path="/dashboard" element={<p>tableau de bord</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const location = () => screen.getByTestId('location').textContent

/** Attend le chemin, laisse passer un tour de macrotâche (écrasement tardif), puis réasserte. */
async function attendreChemin(attendu: string) {
  await waitFor(() => expect(location()).toBe(attendu))
  await new Promise((r) => setTimeout(r, 50))
  expect(location()).toBe(attendu)
}

async function entrerEnDemo() {
  monter()
  await screen.findByText('demo.bandeau.titre')
  expect(location()).toBe('/dashboard')
  return within(screen.getByText('demo.bandeau.titre').closest('[role="status"]') as HTMLElement)
}

beforeEach(() => {
  definirModeDemo(null)
})
afterEach(() => {
  cleanup()
  definirModeDemo(null)
  globalThis.fetch = fetchOriginal
})

describe('sortie de démo — de bout en bout (coquille réelle)', () => {
  it('visiteur, « Quitter la démo » → accueil public, sans /auth/logout', async () => {
    monterFetch(false)
    const bandeau = await entrerEnDemo()
    fireEvent.click(bandeau.getByRole('button', { name: 'demo.bandeau.quitter' }))
    await attendreChemin('/')
    expect(screen.getByText('accueil')).toBeTruthy()
    expect(compter('POST', '/auth/logout')).toBe(0)
    // 1 au montage (réhydratation) + 1 pour la sortie.
    expect(compter('POST', '/auth/refresh')).toBe(2)
  })

  it('visiteur, « Créer mon espace » → inscription, sans /auth/logout', async () => {
    monterFetch(false)
    const bandeau = await entrerEnDemo()
    fireEvent.click(bandeau.getByRole('button', { name: 'commun.actions.creerMonEspace' }))
    await attendreChemin('/inscription')
    expect(screen.getByText('inscription')).toBeTruthy()
    expect(compter('POST', '/auth/logout')).toBe(0)
    expect(compter('POST', '/auth/refresh')).toBe(2)
  })

  it('administrateur réel, « Quitter la démo » → son tableau de bord, session réelle rétablie', async () => {
    monterFetch(true)
    const bandeau = await entrerEnDemo()
    fireEvent.click(bandeau.getByRole('button', { name: 'demo.bandeau.quitter' }))
    await attendreChemin('/dashboard')
    await waitFor(() => expect(screen.queryByText('demo.bandeau.titre')).toBeNull())
    expect(screen.getByText('tableau de bord')).toBeTruthy()
    expect(compter('POST', '/auth/logout')).toBe(0)
    expect(compter('POST', '/auth/refresh')).toBe(2)
    // La dernière lecture du profil se fait avec le VRAI jeton.
    expect(appels.filter((a) => a.chemin === '/auth/me').at(-1)?.auth).toBe('Bearer jeton-reel')
  })

  it('menu compte de la coquille : « Quitter la démo » remplace « Se déconnecter », même sortie', async () => {
    monterFetch(false)
    await entrerEnDemo()
    expect(screen.queryByText('shell.seDeconnecter')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'shell.menuCompte' }))
    const menu = await screen.findByLabelText('shell.menuCompte', { selector: '[aria-label="shell.menuCompte"]:not(button)' })
    fireEvent.click(within(menu).getByRole('button', { name: 'demo.bandeau.quitter' }))
    await attendreChemin('/')
    expect(compter('POST', '/auth/logout')).toBe(0)
    expect(compter('POST', '/auth/refresh')).toBe(2)
  })

  it('tiroir mobile : « Quitter la démo » → même sortie', async () => {
    monterFetch(true)
    await entrerEnDemo()
    fireEvent.click(screen.getByRole('button', { name: 'shell.ouvrirMenu' }))
    const tiroir = await screen.findByRole('dialog', { name: 'shell.menuNavigation' })
    fireEvent.click(within(tiroir).getByRole('button', { name: 'demo.bandeau.quitter' }))
    await attendreChemin('/dashboard')
    await waitFor(() => expect(screen.queryByText('demo.bandeau.titre')).toBeNull())
    expect(compter('POST', '/auth/logout')).toBe(0)
    expect(compter('POST', '/auth/refresh')).toBe(2)
  })

  it('en démo, la coquille nomme le compte « Compte de démonstration », jamais son e-mail technique', async () => {
    monterFetch(false)
    await entrerEnDemo()
    expect(screen.getAllByText('demo.compte').length).toBeGreaterThan(0)
    expect(screen.queryByText(ADMIN_DEMO.email)).toBeNull()
  })

  // La destination vient de l'état de navigation. Elle n'est aujourd'hui posée que par `BandeauDemo`
  // (valeur littérale `/inscription`), mais un chemin externe s'y glisserait par un `state` forgé :
  // `/\hote` est normalisé en `//hote` par les navigateurs (le parseur d'URL traite `\` comme `/`),
  // donc une redirection ouverte vers un autre domaine. Seul un chemin INTERNE est accepté.
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '\\\\evil.example'])(
    'destination externe %s : ignorée, retour à l’accueil public',
    async (destination) => {
      monterFetch(false)
      render(
        <MemoryRouter initialEntries={[{ pathname: '/demo/sortie', state: { destination } }]}>
          <AuthProvider>
            <Sonde />
            <Routes>
              <Route path="/" element={<p>accueil</p>} />
              <Route path="/demo/sortie" element={<SortieDemoPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await attendreChemin('/')
    },
  )

  it('destination interne : respectée', async () => {
    monterFetch(false)
    render(
      <MemoryRouter initialEntries={[{ pathname: '/demo/sortie', state: { destination: '/inscription' } }]}>
        <AuthProvider>
          <Sonde />
          <Routes>
            <Route path="/" element={<p>accueil</p>} />
            <Route path="/inscription" element={<p>inscription</p>} />
            <Route path="/demo/sortie" element={<SortieDemoPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await attendreChemin('/inscription')
  })

  it('arrivée directe sur /demo/sortie hors démo : navigue seulement, aucun refresh supplémentaire', async () => {
    monterFetch(false)
    render(
      <MemoryRouter initialEntries={['/demo/sortie']}>
        <AuthProvider>
          <Sonde />
          <Routes>
            <Route path="/" element={<p>accueil</p>} />
            <Route path="/demo/sortie" element={<SortieDemoPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await attendreChemin('/')
    expect(compter('POST', '/auth/refresh')).toBe(1)
    expect(compter('POST', '/demo/session')).toBe(0)
  })
})
