// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BandeauDemo } from './BandeauDemo'

let modeDemo = true
const quitterDemo = vi.fn()
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ modeDemo, quitterDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

/** Affiche l'état de navigation reçu par /demo/sortie. */
function SondeSortie() {
  const { state } = useLocation()
  return <p>{`sortie:${JSON.stringify(state)}`}</p>
}

const rendre = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<BandeauDemo />} />
        <Route path="/demo/sortie" element={<SondeSortie />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  modeDemo = true
  quitterDemo.mockReset()
})
afterEach(cleanup)

describe('BandeauDemo', () => {
  it('hors démo : rien', () => {
    modeDemo = false
    rendre()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('en démo : message non fermable, rôle status', () => {
    rendre()
    const bandeau = screen.getByRole('status')
    expect(bandeau.textContent).toContain('demo.bandeau.titre')
    expect(screen.queryByRole('button', { name: /fermer/i })).toBeNull()
  })

  // La sortie elle-même (quitterDemo, destination selon la session réelle) est exécutée par
  // /demo/sortie, HORS coquille protégée : cf. SortieDemo.integration.test.tsx.
  it('« Quitter » navigue vers /demo/sortie sans destination, sans quitter depuis la coquille', () => {
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /demo.bandeau.quitter/ }))
    expect(screen.getByText('sortie:{}')).toBeTruthy()
    expect(quitterDemo).not.toHaveBeenCalled()
  })

  it('« Créer mon espace » navigue vers /demo/sortie avec la destination /inscription', () => {
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /commun.actions.creerMonEspace/ }))
    expect(screen.getByText('sortie:{"destination":"/inscription"}')).toBeTruthy()
    expect(quitterDemo).not.toHaveBeenCalled()
  })
})
