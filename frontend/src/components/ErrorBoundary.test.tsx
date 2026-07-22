// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'
import { signaler } from '@/lib/observabilite'

// Les libellés i18n ne sont pas l'objet du test ; on court-circuite react-i18next (t → clé).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// On espionne la couche d'observabilité : le boundary DOIT signaler le crash.
vi.mock('@/lib/observabilite', () => ({ signaler: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** Composant qui lève au rendu, pour déclencher le boundary. */
function Explose(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('affiche le fallback (pas un écran blanc) quand un enfant crashe', () => {
    // React journalise l'erreur captée sur la console ; on le tait pour garder la sortie propre.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Explose />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('commun.erreurFatale.titre')).toBeTruthy()
    spy.mockRestore()
  })

  it('signale le crash via la couche observabilité', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Explose />
      </ErrorBoundary>,
    )
    expect(vi.mocked(signaler)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(signaler).mock.calls[0][0]).toBeInstanceOf(Error)
    spy.mockRestore()
  })

  it('rend normalement les enfants quand rien ne crashe', () => {
    render(
      <ErrorBoundary>
        <span>contenu sain</span>
      </ErrorBoundary>,
    )
    expect(screen.getByText('contenu sain')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(signaler).not.toHaveBeenCalled()
  })
})
