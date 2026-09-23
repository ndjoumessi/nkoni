// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConfigPaiement } from './ConfigPaiement'

const configPaiement = vi.fn()
vi.mock('@/lib/api', () => ({
  // `ApiError` : le composant passe par `useRessource`, qui la consulte dans son `catch`. Un
  // mock qui l'omet fait lever le hook — tests verts, mais vitest rapporte une erreur non attribuée.
  ApiError: class extends Error {},

  organisationApi: { configPaiement: (...a: unknown[]) => configPaiement(...a) },
  messageErreur: (e: unknown) => String(e),
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton' }) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

beforeEach(() => {
  configPaiement.mockReset()
  configPaiement.mockResolvedValue({ configure: false, actif: false, provider: null, environnement: null, identifiantPublic: null, misAJourLe: null })
})
afterEach(cleanup)

describe('ConfigPaiement', () => {
  it('hors forfait (inclus = false) : carte verrouillée, aucune lecture de la configuration', () => {
    render(<ConfigPaiement inclus={false} />)
    expect(screen.getByText('parametres.paiement.reserveForfaitPro')).toBeTruthy()
    expect(configPaiement).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('inclus (défaut) : lit la configuration comme avant', () => {
    render(<ConfigPaiement />)
    expect(configPaiement).toHaveBeenCalled()
  })
})
