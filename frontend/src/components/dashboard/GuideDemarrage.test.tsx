// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GuideDemarrage } from './GuideDemarrage'

const moi = vi.fn()
// `ApiError` fait partie du mock : le composant passe désormais par `useRessource`, qui distingue
// une erreur d'API (message déjà traduit par le serveur) d'une panne réseau. Un mock qui l'omet
// fait lever le hook au moment du `catch` — test vert, erreur non attribuée.
vi.mock('@/lib/api', () => ({
  organisationApi: { moi: (...a: unknown[]) => moi(...a) },
  ApiError: class extends Error {},
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton' }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const ETAPES = { bareme: true, membres: false, versement: false }
const ASTUCE = 'dashboard.guide.paiement.titre'

const rendre = (montrerPaiement: boolean) =>
  render(
    <MemoryRouter>
      <GuideDemarrage etapes={ETAPES} montrerPaiement={montrerPaiement} />
    </MemoryRouter>,
  )

beforeEach(() => {
  moi.mockReset()
  localStorage.clear()
})
afterEach(cleanup)

describe('GuideDemarrage — astuce paiement en ligne selon le forfait', () => {
  it('sans droit de configurer : ni astuce ni lecture de l’organisation', () => {
    rendre(false)
    expect(screen.queryByText(ASTUCE)).toBeNull()
    expect(moi).not.toHaveBeenCalled()
  })

  it('paiement en ligne inclus : astuce affichée', async () => {
    moi.mockResolvedValue({ paiementEnLigneInclus: true })
    rendre(true)
    expect(await screen.findByText(ASTUCE)).toBeTruthy()
  })

  it('forfait Gratuit sans droit acquis : astuce masquée (jamais vers une carte verrouillée)', async () => {
    moi.mockResolvedValue({ paiementEnLigneInclus: false })
    rendre(true)
    await waitFor(() => expect(moi).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByText(ASTUCE)).toBeNull()
    expect(screen.getByText('dashboard.guide.titre')).toBeTruthy()
  })

  it('API sans le champ (front déployé avant le backend) : comportement antérieur, astuce affichée', async () => {
    moi.mockResolvedValue({})
    rendre(true)
    expect(await screen.findByText(ASTUCE)).toBeTruthy()
  })

  it('lecture en échec : astuce affichée (rappel facultatif, jamais bloquant)', async () => {
    moi.mockRejectedValue(new Error('réseau'))
    rendre(true)
    expect(await screen.findByText(ASTUCE)).toBeTruthy()
  })
})

describe('GuideDemarrage — espace d’exemple', () => {
  it('propose de voir un espace rempli (lien vers /demo)', () => {
    rendre(false)
    const lien = screen.getByRole('link', { name: /demo.entree.voirEspaceRempli/ })
    expect(lien.getAttribute('href')).toBe('/demo')
  })
})
