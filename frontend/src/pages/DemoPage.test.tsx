// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/lib/api'
import { DemoPage } from './DemoPage'

const demarrerDemo = vi.fn()
let loading = false
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ loading, demarrerDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const rendre = () =>
  render(
    <MemoryRouter initialEntries={['/demo']}>
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/dashboard" element={<p>tableau de bord</p>} />
        <Route path="/" element={<p>accueil</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  demarrerDemo.mockReset()
  loading = false
})
afterEach(cleanup)

describe('DemoPage', () => {
  it('ouvre la démo puis mène au tableau de bord', async () => {
    demarrerDemo.mockResolvedValue({ id: 'u-demo', role: 'ADMIN' })
    rendre()
    expect(await screen.findByText('tableau de bord')).toBeTruthy()
    expect(demarrerDemo).toHaveBeenCalledTimes(1)
  })

  it('attend la fin de la réhydratation avant d’ouvrir la démo', () => {
    loading = true
    rendre()
    expect(demarrerDemo).not.toHaveBeenCalled()
    expect(screen.getByText('demo.page.ouverture')).toBeTruthy()
  })

  it('démo éteinte (404) : message « indisponible » et retour à l’accueil', async () => {
    demarrerDemo.mockRejectedValue(new ApiError(404, 'indisponible'))
    rendre()
    expect(await screen.findByText('demo.page.indisponibleTitre')).toBeTruthy()
    expect(screen.getByRole('link', { name: /commun.actions.retourAccueil/ }).getAttribute('href')).toBe('/')
  })

  it('erreur réseau : message d’erreur avec « Réessayer »', async () => {
    demarrerDemo.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    demarrerDemo.mockResolvedValueOnce({ id: 'u-demo', role: 'ADMIN' })
    rendre()
    expect(await screen.findByText('demo.page.erreurTitre')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /commun\.actions\.reessayer/ }))
    await waitFor(() => expect(screen.getByText('tableau de bord')).toBeTruthy())
  })
})
