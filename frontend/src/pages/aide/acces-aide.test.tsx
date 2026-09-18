// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
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
})
