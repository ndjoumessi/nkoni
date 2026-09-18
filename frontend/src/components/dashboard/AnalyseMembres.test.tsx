// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalyseMembres } from './AnalyseMembres'

const analyse = vi.fn()
vi.mock('@/lib/api', () => ({
  membresApi: { analyse: (...a: unknown[]) => analyse(...a) },
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
  id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', telephone: null as string | null, branche: null,
  statutCotisation: 'NON_A_JOUR' as const, manque: 10_000,
}
/** Réponse de `GET /membres/statuts/analyse` : `total` = TOUS les membres à relancer. */
const reponse = (membres: (typeof membre)[], total = membres.length) => ({
  branches: [],
  relance: { total, membres },
})

beforeEach(() => {
  analyse.mockReset()
  modeDemo = false
})
afterEach(cleanup)

describe('AnalyseMembres — analyse agrégée par le serveur', () => {
  it('le compteur annonce le TOTAL à relancer, et « voir tous » paraît quand il dépasse le détail', async () => {
    // 1 170 à relancer, six détaillés : le compteur ne doit pas se limiter aux lignes affichées.
    analyse.mockResolvedValue(reponse([membre], 1170))
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    expect(await screen.findByText('1170')).toBeTruthy()
    expect(screen.getByRole('link', { name: /dashboard\.analyse\.voirTous/ })).toBeTruthy()
  })

  it('tout est détaillé : pas de lien « voir tous »', async () => {
    analyse.mockResolvedValue(reponse([membre]))
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Tchoupa Bernard', { exact: false })).toBeTruthy())
    expect(screen.queryByRole('link', { name: /dashboard\.analyse\.voirTous/ })).toBeNull()
  })

  it('branche null (membres sans branche) : libellé traduit, lien de filtre sur la sentinelle', async () => {
    analyse.mockResolvedValue({
      branches: [
        { id: 'b1', nom: 'Nord', attendu: 10, valorise: 2, taux: 20 },
        { id: null, nom: null, attendu: 10, valorise: 5, taux: 50 },
      ],
      relance: { total: 0, membres: [] },
    })
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const lien = await screen.findByRole('link', { name: 'branches.sansBranche' })
    expect(lien.getAttribute('href')).toBe(`/membres?branche=${encodeURIComponent('—')}`)
  })
})

describe('AnalyseMembres — relance WhatsApp en démo', () => {
  const joignable = { ...membre, telephone: '677123456' }

  it('hors démo : lien wa.me présent (contrôle du test)', async () => {
    analyse.mockResolvedValue(reponse([joignable]))
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const lien = await screen.findByRole('link', { name: 'dashboard.analyse.relancerWhatsApp' })
    expect(lien.getAttribute('href')).toContain('wa.me')
  })

  it('en démo : aucun lien wa.me, bouton désactivé', async () => {
    modeDemo = true
    analyse.mockResolvedValue(reponse([joignable]))
    const { container } = render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const bouton = await screen.findByRole('button', { name: 'demo.whatsappDesactive' })
    expect((bouton as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })
})
