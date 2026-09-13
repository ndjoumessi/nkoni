// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PlatformOrganisation } from '@/lib/api'
import { ProlongationForfait } from './ProlongationForfait'

const prolongerForfait = vi.fn()
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  platformApi: { prolongerForfait: (...a: unknown[]) => prolongerForfait(...a) },
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
// t → « clé » ou « clé|{options JSON} » : on vérifie les clés et les paramètres, pas la traduction.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)
beforeEach(() => {
  prolongerForfait.mockReset()
  prolongerForfait.mockImplementation(async (_id: string, mois: number, apercu: boolean) => ({
    organisation: { ...ORG_PRO, forfaitExpireLe: '2027-09-13T22:59:59.999Z' },
    echeanceActuelle: null,
    nouvelleEcheance: `2027-0${Math.min(mois, 9)}-13T22:59:59.999Z`,
    etatApres: 'ACTIF',
    joursRestantsApres: 365,
    apercu,
  }))
})

const ORG_PRO: PlatformOrganisation = {
  id: 'org-1',
  nom: 'Les Bâtisseurs',
  devise: 'FCFA',
  langueDefaut: 'FR',
  actif: true,
  forfait: 'PRO',
  createdAt: '2026-01-01T00:00:00Z',
  nbMembres: 12,
  forfaitExpireLe: null,
  etatForfait: 'SANS_ECHEANCE',
  joursRestants: null,
  finGraceLe: null,
  forfaitEffectif: 'PRO',
}

describe('ProlongationForfait', () => {
  it('forfait GRATUIT : explique l’absence d’échéance, aucun appel serveur', () => {
    render(<ProlongationForfait org={{ ...ORG_PRO, forfait: 'GRATUIT' }} accessToken="jeton" onProlonge={vi.fn()} />)
    expect(screen.getByText('superAdmin.prolongation.gratuit')).toBeTruthy()
    expect(prolongerForfait).not.toHaveBeenCalled()
  })

  it('demande un APERÇU serveur (apercu = true) dès l’affichage, puis à chaque durée choisie', async () => {
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={vi.fn()} />)
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 1, true, 'jeton'))
    fireEvent.click(screen.getByLabelText('superAdmin.prolongation.mois|{"count":12}'))
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 12, true, 'jeton'))
  })

  it('le bouton reste inactif tant que l’aperçu n’est pas arrivé', () => {
    prolongerForfait.mockImplementation(() => new Promise(() => {}))
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={vi.fn()} />)
    const bouton = screen.getByRole('button') as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
  })

  it('prolonger : écrit (apercu = false) et remonte la vue renvoyée par le serveur', async () => {
    const onProlonge = vi.fn()
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={onProlonge} />)
    const bouton = (await screen.findByRole('button')) as HTMLButtonElement
    await waitFor(() => expect(bouton.disabled).toBe(false))
    fireEvent.click(bouton)
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 1, false, 'jeton'))
    await waitFor(() =>
      expect(onProlonge).toHaveBeenCalledWith(expect.objectContaining({ id: 'org-1', forfaitExpireLe: '2027-09-13T22:59:59.999Z' })),
    )
  })
})
