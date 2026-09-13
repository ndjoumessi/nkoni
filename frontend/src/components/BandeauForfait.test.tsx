// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { OrganisationCourante } from '@/lib/api'
import { BandeauForfait } from './BandeauForfait'

const moi = vi.fn()
vi.mock('@/lib/api', () => ({ organisationApi: { moi: (...a: unknown[]) => moi(...a) } }))
let role = 'ADMIN'
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role }, accessToken: 'jeton' }) }))
// t → « clé » ou « clé|{options JSON} ».
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const ORG: OrganisationCourante = {
  id: 'org-1',
  nom: 'Les Bâtisseurs',
  devise: 'FCFA',
  langueDefaut: 'FR',
  forfait: 'PRO',
  createdAt: '2026-01-01T00:00:00Z',
  nbMembres: 12,
  limiteMembres: null,
  chefMembreId: null,
  chefSurnom: null,
  chefNom: null,
  chefPrenom: null,
  forfaitExpireLe: '2026-09-18T22:59:59.999Z',
  etatForfait: 'ECHEANCE_PROCHE',
  joursRestants: 5,
  finGraceLe: '2026-10-02T22:59:59.999Z',
  forfaitEffectif: 'PRO',
}

const rendre = (initialEntries: string[] = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <BandeauForfait />
    </MemoryRouter>,
  )

beforeEach(() => {
  role = 'ADMIN'
  moi.mockReset()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('BandeauForfait (spec 1.1 §4.4)', () => {
  it.each(['TRESORIERE', 'SECRETAIRE', 'MEMBRE_SIMPLE'])('%s : rien, et aucune lecture de l’organisation', (r) => {
    role = r
    const { container } = rendre()
    expect(container.innerHTML).toBe('')
    expect(moi).not.toHaveBeenCalled()
  })

  it('PRESIDENT, échéance à J-5 : bandeau role=status fermable, fermeture mémorisée pour la session', async () => {
    role = 'PRESIDENT'
    moi.mockResolvedValue(ORG)
    rendre()
    const bandeau = await screen.findByRole('status')
    expect(bandeau.textContent).toContain('shell.bandeauForfait.proche')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'shell.bandeauForfait.fermer' }))
    expect(screen.queryByRole('status')).toBeNull()

    cleanup()
    rendre()
    await waitFor(() => expect(moi).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('grâce : bandeau NON fermable', async () => {
    moi.mockResolvedValue({ ...ORG, etatForfait: 'GRACE', joursRestants: -3 })
    rendre()
    expect((await screen.findByRole('status')).textContent).toContain('shell.bandeauForfait.grace')
    expect(screen.queryByRole('button', { name: 'shell.bandeauForfait.fermer' })).toBeNull()
  })

  it('expiré : bandeau fermable', async () => {
    moi.mockResolvedValue({ ...ORG, etatForfait: 'EXPIRE', joursRestants: -20, forfaitEffectif: 'GRATUIT' })
    rendre()
    expect((await screen.findByRole('status')).textContent).toContain('shell.bandeauForfait.expire')
    expect(screen.getByRole('button', { name: 'shell.bandeauForfait.fermer' })).toBeTruthy()
  })

  it('échéance à J-12 ou actif : rien', async () => {
    moi.mockResolvedValue({ ...ORG, joursRestants: 12 })
    const { container } = rendre()
    await waitFor(() => expect(moi).toHaveBeenCalled())
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('lecture en échec : rien, aucune erreur affichée', async () => {
    moi.mockRejectedValue(new Error('réseau'))
    const { container } = rendre()
    await waitFor(() => expect(moi).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('sur /parametres, rien — même en grâce (la carte d’échéance y dit déjà la même chose)', async () => {
    moi.mockResolvedValue({ ...ORG, etatForfait: 'GRACE', joursRestants: -3 })
    const { container } = rendre(['/parametres'])
    await waitFor(() => expect(moi).toHaveBeenCalled())
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
