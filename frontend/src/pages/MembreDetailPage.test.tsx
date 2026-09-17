// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MembreDetailPage } from './MembreDetailPage'

/** Relance WhatsApp du menu « Plus » de la fiche membre — désactivée en démo (revue finale PR 3, #11). */

const refus = vi.hoisted(() => async () => {
  throw new Error('refusé')
})
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  membresApi: {
    get: async () => ({
      id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', sexe: null, dateNaissance: null, fonctionSociale: null,
      statut: 'ACTIF', telephone: '677123456', email: null, adresse: null, brancheId: null,
      chefSousFamilleId: null, anneeAdhesion: 2024, anneeFinContribution: null, dateDeces: null,
      compteUtilisateurId: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }),
    statut: async () => ({ totalAttenduCumule: 10_000, totalValoriseCumule: 0, statut: 'NON_A_JOUR' }),
  },
  contributionsApi: { listByMembre: refus },
  branchesApi: { list: refus },
  equilibragesApi: { listByMembre: refus },
  organisationApi: { moi: refus },
}))
let modeDemo = false
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ accessToken: 'jeton', user: { role: 'ADMIN' }, modeDemo }),
}))
vi.mock('@/components/documents/DocumentsSection', () => ({ DocumentsSection: () => null }))
vi.mock('@/components/membres/AvatarMembre', () => ({ AvatarMembre: () => null }))
vi.mock('@/components/membres/CropperPhoto', () => ({ CropperPhoto: () => null }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('@/lib/i18n', () => ({ default: { t: (c: string) => c, language: 'fr' }, cleI18n: (c: string) => c }))
// `t` STABLE : la page le met dans les dépendances de son effet de chargement.
const traduction = vi.hoisted(() => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => traduction,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

async function ouvrirMenu() {
  render(
    <MemoryRouter initialEntries={['/membres/m1']}>
      <Routes>
        <Route path="/membres/:id" element={<MembreDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'membres.detail.plus' }))
  return screen.findByRole('menuitem', { name: 'membres.detail.relancerWhatsApp' })
}

let ouvrir: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  modeDemo = false
  ouvrir = vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MembreDetailPage — relance WhatsApp', () => {
  it('hors démo : ouvre wa.me (contrôle du test)', async () => {
    fireEvent.click(await ouvrirMenu())
    expect(ouvrir).toHaveBeenCalledTimes(1)
    expect(String(ouvrir.mock.calls[0][0])).toContain('wa.me')
  })

  it('en démo : entrée désactivée, expliquée, aucun window.open', async () => {
    modeDemo = true
    const entree = (await ouvrirMenu()) as HTMLButtonElement
    expect(entree.disabled).toBe(true)
    expect(entree.title).toBe('demo.whatsappDesactive')
    fireEvent.click(entree)
    expect(ouvrir).not.toHaveBeenCalled()
  })
})
