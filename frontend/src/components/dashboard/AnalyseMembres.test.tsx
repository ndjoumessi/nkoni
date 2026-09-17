// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalyseMembres } from './AnalyseMembres'

const listStatutsPage = vi.fn()
vi.mock('@/lib/api', () => ({
  membresApi: { listStatutsPage: (...a: unknown[]) => listStatutsPage(...a) },
}))
let modeDemo = false
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton', modeDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, opts?: Record<string, unknown>) => (opts ? `${cle} ${JSON.stringify(opts)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const membre = {
  id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', sexe: null, statut: 'ACTIF', telephone: null,
  brancheId: null, branche: null, anneeAdhesion: 2024, anneeFinContribution: null,
  statutCotisation: 'NON_A_JOUR', totalAttenduCumule: 10_000, totalValoriseCumule: 0,
}

beforeEach(() => {
  listStatutsPage.mockReset()
  modeDemo = false
})
afterEach(cleanup)

describe('AnalyseMembres — plafond des statuts calculés', () => {
  it('liste tronquée par le serveur : l’analyse le dit (plafond et total réel)', async () => {
    listStatutsPage.mockResolvedValue({ items: [membre], total: 1500, tronque: true })
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const note = await screen.findByText(/dashboard\.analyse\.tronque/)
    expect(note.textContent).toContain('"plafond":1')
    expect(note.textContent).toContain('"total":1500')
  })

  it('liste complète : aucune mention de troncature', async () => {
    listStatutsPage.mockResolvedValue({ items: [membre], total: 1, tronque: false })
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Tchoupa Bernard', { exact: false })).toBeTruthy())
    expect(screen.queryByText(/dashboard\.analyse\.tronque/)).toBeNull()
  })
})

describe('AnalyseMembres — relance WhatsApp en démo', () => {
  const joignable = { ...membre, telephone: '677123456' }

  it('hors démo : lien wa.me présent (contrôle du test)', async () => {
    listStatutsPage.mockResolvedValue({ items: [joignable], total: 1, tronque: false })
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const lien = await screen.findByRole('link', { name: 'dashboard.analyse.relancerWhatsApp' })
    expect(lien.getAttribute('href')).toContain('wa.me')
  })

  it('en démo : aucun lien wa.me, bouton désactivé', async () => {
    modeDemo = true
    listStatutsPage.mockResolvedValue({ items: [joignable], total: 1, tronque: false })
    const { container } = render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const bouton = await screen.findByRole('button', { name: 'demo.whatsappDesactive' })
    expect((bouton as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })
})
