// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VersementsList } from './VersementsList'

/** Partage du reçu par WhatsApp (wa.me) — désactivé en démo (revue finale PR 3, I3). */

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  MODES_VERSEMENT: ['ESPECES'],
  versementsApi: {
    listByContribution: async () => [
      { id: 'v1', montant: 10_000, dateVersement: '2026-03-01T00:00:00.000Z', mode: 'ESPECES', note: null },
    ],
  },
  recusApi: {
    listByMembre: async () => [
      { id: 'r1', versementId: 'v1', numero: 'R-0001', annuleLe: null, annee: 2026, signaturePartage: 's' },
    ],
    urlPartage: () => 'https://nkoni.test/recu',
  },
}))
let modeDemo = false
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ accessToken: 'jeton', user: { role: 'ADMIN', nomOrganisation: 'Asso' }, modeDemo }),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('@/lib/i18n', () => ({ default: { t: (c: string) => c, language: 'fr' }, cleI18n: (c: string) => c }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const rendre = () =>
  render(<VersementsList contributionId="c1" membreId="m1" annee={2026} membreTelephone="677123456" membrePrenom="Bernard" />)

let ouvrir: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  modeDemo = false
  ouvrir = vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VersementsList — partage WhatsApp du reçu', () => {
  it('hors démo : ouvre wa.me vers le numéro du membre (contrôle du test)', async () => {
    rendre()
    fireEvent.click(await screen.findByRole('button', { name: 'versements.liste.whatsapp' }))
    expect(ouvrir).toHaveBeenCalledTimes(1)
    expect(String(ouvrir.mock.calls[0][0])).toContain('https://wa.me/237677123456')
  })

  it('en démo : contrôle désactivé, expliqué, et aucun window.open', async () => {
    modeDemo = true
    rendre()
    const bouton = (await screen.findByRole('button', { name: 'demo.whatsappDesactive' })) as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
    expect(bouton.title).toBe('demo.whatsappDesactive')
    fireEvent.click(bouton)
    expect(ouvrir).not.toHaveBeenCalled()
  })
})
