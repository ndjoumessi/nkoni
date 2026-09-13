// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { OrganisationCourante } from '@/lib/api'
import { EcheanceForfaitOrganisation } from './EcheanceForfaitOrganisation'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const BASE: OrganisationCourante = {
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
  forfaitExpireLe: '2026-10-13T22:59:59.999Z',
  etatForfait: 'ACTIF',
  joursRestants: 60,
  finGraceLe: '2026-10-27T22:59:59.999Z',
  forfaitEffectif: 'PRO',
}

describe('EcheanceForfaitOrganisation', () => {
  it('sans échéance : rien n’est affiché', () => {
    const { container } = render(
      <EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: 'SANS_ECHEANCE', forfaitExpireLe: null }} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('actif : la date de validité, sans appel au renouvellement', () => {
    render(<EcheanceForfaitOrganisation org={BASE} />)
    expect(screen.getByText('parametres.forfait.valableJusquau')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it.each(['GRACE', 'EXPIRE'] as const)('%s : l’échéance est dite PASSÉE, jamais « valable jusqu’au »', (etat) => {
    render(<EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: etat }} />)
    expect(screen.getByText('parametres.forfait.echuLe')).toBeTruthy()
    expect(screen.queryByText('parametres.forfait.valableJusquau')).toBeNull()
  })

  it.each(['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const)('%s : explication + lien de renouvellement vers le contact', (etat) => {
    render(<EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: etat }} />)
    expect(screen.getByText(`parametres.forfait.explication.${etat}`)).toBeTruthy()
    const lien = screen.getByRole('link')
    expect(lien.getAttribute('href')).toMatch(/^mailto:romel\.djoumessi@gmail\.com\?subject=/)
  })
})
