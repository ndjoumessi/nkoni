// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BandeauDemo } from './BandeauDemo'

let modeDemo = true
const quitterDemo = vi.fn()
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ modeDemo, quitterDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const rendre = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<BandeauDemo />} />
        <Route path="/" element={<p>accueil</p>} />
        <Route path="/inscription" element={<p>inscription</p>} />
        <Route path="/mon-espace" element={<p>mon espace</p>} />
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

  it('« Quitter » sans session réelle → accueil', async () => {
    quitterDemo.mockResolvedValue(null)
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /demo.bandeau.quitter/ }))
    expect(await screen.findByText('accueil')).toBeTruthy()
    expect(quitterDemo).toHaveBeenCalledTimes(1)
  })

  it('« Quitter » avec session réelle → accueil de son rôle', async () => {
    quitterDemo.mockResolvedValue({ id: 'u', role: 'MEMBRE_SIMPLE' })
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /demo.bandeau.quitter/ }))
    expect(await screen.findByText('mon espace')).toBeTruthy()
  })

  it('« Créer mon espace » quitte d’abord la démo puis ouvre l’inscription', async () => {
    quitterDemo.mockResolvedValue(null)
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /commun.actions.creerMonEspace/ }))
    expect(await screen.findByText('inscription')).toBeTruthy()
    expect(quitterDemo).toHaveBeenCalledTimes(1)
  })
})
