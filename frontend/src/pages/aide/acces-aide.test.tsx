// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import { AppShell } from '@/components/AppShell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

/**
 * `AppShell` (tiroir mobile) lit `useAuth` — mocké directement plutôt que monté sous un vrai
 * `AuthProvider` : aucune session/fetch réel n'est nécessaire pour vérifier la présence d'un lien
 * dans le tiroir. `membreId: undefined` + rôle hors `GESTION_FORFAIT` évitent les deux fetch
 * best-effort de la coquille (`/moi/situation`, `/organisations/moi`), qui resteraient sinon en
 * attente dans le test.
 */
const UTILISATEUR = {
  id: 'u1',
  email: 'membre@asso.cm',
  role: 'MEMBRE_SIMPLE',
  membreId: undefined,
  nomOrganisation: undefined,
}

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: UTILISATEUR,
    accessToken: null,
    loading: false,
    isAuthenticated: true,
    modeDemo: false,
    logout: async () => {},
    login: async () => UTILISATEUR,
    inscription: async () => {},
    changerLangue: async () => {},
    demarrerDemo: async () => UTILISATEUR,
    quitterDemo: async () => null,
  }),
}))

afterEach(cleanup)

describe('accès à l’aide', () => {
  it('le pied de page de l’accueil mène à /aide', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toContain('/aide')
  })

  /**
   * Régression (revue) : le lien « Aide » du menu compte n'existait que dans `CompteMenu`, monté
   * UNIQUEMENT dans la barre supérieure desktop (`TopBar`, `hidden … lg:block`) — un utilisateur
   * connecté sur téléphone n'avait donc AUCUN chemin vers `/aide` depuis l'application. On cible ici
   * explicitement le TIROIR MOBILE (`role="dialog"`, `aria-label="shell.menuNavigation"`, ouvert par
   * le bouton hamburger) plutôt que la seule présence d'un lien dans le DOM : un lien rendu seulement
   * côté desktop ferait passer cette assertion à tort si elle ne visait pas ce conteneur précis.
   */
  it('le tiroir mobile de la coquille mène à /aide, à côté de « Mon profil »', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>contenu</p>
        </AppShell>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'shell.ouvrirMenu' }))
    const tiroir = within(screen.getByRole('dialog', { name: 'shell.menuNavigation' }))
    expect(tiroir.getByRole('link', { name: 'shell.aide' }).getAttribute('href')).toBe('/aide')
  })
})
