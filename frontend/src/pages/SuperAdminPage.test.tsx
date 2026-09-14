// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PlatformOrganisation } from '@/lib/api'
import SuperAdminPage from './SuperAdminPage'

/**
 * Console super-admin — suivi des échéances (décision PO 2026-09-14) : les forfaits payants SANS
 * échéance ont leur propre carte-filtre, distincte de « à relancer », et les deux filtres s'excluent.
 */

const listOrganisations = vi.fn()
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>()
  return { ...reel, platformApi: { listOrganisations: (...a: unknown[]) => listOrganisations(...a) } }
})
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ops@nkoni.test', role: 'SUPER_ADMIN' }, accessToken: 'jeton', logout: vi.fn() }),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const org = (id: string, nom: string, forfait: PlatformOrganisation['forfait'], etat: PlatformOrganisation['etatForfait'], expireLe: string | null): PlatformOrganisation => ({
  id, nom, devise: 'FCFA', langueDefaut: 'FR', actif: true, forfait, createdAt: '2026-07-10T10:00:00.000Z', nbMembres: 12,
  forfaitExpireLe: expireLe, etatForfait: etat, joursRestants: expireLe ? -3 : null, finGraceLe: null, forfaitEffectif: forfait,
})

const ORGS = [
  org('o-historique', 'Famille Historique', 'PRO', 'SANS_ECHEANCE', null),
  org('o-grace', 'Tontine En Grâce', 'PRO', 'GRACE', '2026-09-11T22:59:59.999Z'),
  org('o-gratuit', 'Association Gratuite', 'GRATUIT', 'SANS_ECHEANCE', null),
]

const carte = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement
const nomsAffiches = () => ORGS.map((o) => o.nom).filter((n) => screen.queryAllByText(n).length > 0)

beforeEach(() => {
  localStorage.clear()
  listOrganisations.mockReset()
  listOrganisations.mockResolvedValue({ organisations: ORGS })
})
afterEach(cleanup)

describe('SuperAdminPage — payants sans échéance', () => {
  it('compte à part les payants sans échéance, sans les mêler à « à relancer »', async () => {
    render(<MemoryRouter><SuperAdminPage /></MemoryRouter>)
    const sans = (await screen.findByText('superAdmin.kpi.sansEcheance')).closest('button') as HTMLButtonElement
    expect(within(sans).getByText('1')).toBeTruthy()
    expect(within(carte('superAdmin.kpi.aRelancer')).getByText('1')).toBeTruthy()
  })

  it('la carte filtre le tableau, et les deux filtres s’excluent', async () => {
    render(<MemoryRouter><SuperAdminPage /></MemoryRouter>)
    await screen.findByText('superAdmin.kpi.sansEcheance')

    fireEvent.click(carte('superAdmin.kpi.sansEcheance'))
    expect(carte('superAdmin.kpi.sansEcheance').getAttribute('aria-pressed')).toBe('true')
    expect(nomsAffiches()).toEqual(['Famille Historique'])

    fireEvent.click(carte('superAdmin.kpi.aRelancer'))
    expect(carte('superAdmin.kpi.aRelancer').getAttribute('aria-pressed')).toBe('true')
    expect(carte('superAdmin.kpi.sansEcheance').getAttribute('aria-pressed')).toBe('false')
    expect(nomsAffiches()).toEqual(['Tontine En Grâce'])
  })

  it('aucun payant sans échéance : pas de carte', async () => {
    listOrganisations.mockResolvedValue({ organisations: ORGS.filter((o) => o.id !== 'o-historique') })
    render(<MemoryRouter><SuperAdminPage /></MemoryRouter>)
    await screen.findByText('superAdmin.kpi.aRelancer')
    expect(screen.queryByText('superAdmin.kpi.sansEcheance')).toBeNull()
  })
})
