// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BadgeEcheance } from './BadgeEcheance'

// Les libellés ne sont pas l'objet du test : t → « clé » ou « clé:count ».
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: { count?: number }) => (o?.count === undefined ? cle : `${cle}:${o.count}`),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const ISO = '2026-10-13T22:59:59.999Z'

describe('BadgeEcheance', () => {
  it('sans échéance : un tiret, aucun badge', () => {
    render(<BadgeEcheance etat="SANS_ECHEANCE" joursRestants={null} expireLe={null} />)
    expect(screen.getByText('commun.echeance.sans')).toBeTruthy()
  })

  it('échéance proche : jours restants', () => {
    render(<BadgeEcheance etat="ECHEANCE_PROCHE" joursRestants={12} expireLe={ISO} />)
    expect(screen.getByText('commun.echeance.proche:12')).toBeTruthy()
  })

  it('grâce : jours ÉCOULÉS depuis l’échéance, en positif', () => {
    render(<BadgeEcheance etat="GRACE" joursRestants={-3} expireLe={ISO} />)
    expect(screen.getByText('commun.echeance.grace:3')).toBeTruthy()
  })

  it('expiré : libellé expiré ; la date est masquable', () => {
    const { container } = render(<BadgeEcheance etat="EXPIRE" joursRestants={-40} expireLe={ISO} masquerDate />)
    expect(screen.getByText('commun.echeance.expire')).toBeTruthy()
    expect(container.querySelectorAll('span.text-muted-foreground')).toHaveLength(0)
  })

  it('champs undefined (B2 — front déployé avant le backend) : neutre, comme sans échéance', () => {
    render(<BadgeEcheance etat={undefined} joursRestants={undefined} expireLe={undefined} />)
    expect(screen.getByText('commun.echeance.sans')).toBeTruthy()
  })
})
