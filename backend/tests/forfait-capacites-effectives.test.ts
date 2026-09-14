import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, capacitesEffectives, paiementEnLigneAutorise } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

const NOW = new Date('2026-09-14T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('capacitesEffectives — forfait EFFECTIF (spec 1.1 §2.3)', () => {
  it('PRO actif, en échéance proche ou en grâce : capacités Pro', () => {
    expect(capacitesEffectives('PRO', fin('2026-12-31'), NOW)).toBe(CAPACITES_FORFAIT.PRO)
    expect(capacitesEffectives('PRO', fin('2026-09-20'), NOW)).toBe(CAPACITES_FORFAIT.PRO)
    expect(capacitesEffectives('PRO', fin('2026-09-01'), NOW)).toBe(CAPACITES_FORFAIT.PRO) // J = -13
  })

  it('PRO expiré au-delà de la grâce : capacités GRATUIT', () => {
    expect(capacitesEffectives('PRO', fin('2026-08-30'), NOW)).toBe(CAPACITES_FORFAIT.GRATUIT) // J = -15
  })

  it('sans échéance : capacités du forfait enregistré', () => {
    expect(capacitesEffectives('ENTREPRISE', null, NOW)).toBe(CAPACITES_FORFAIT.ENTREPRISE)
    expect(capacitesEffectives('GRATUIT', null, NOW)).toBe(CAPACITES_FORFAIT.GRATUIT)
  })
})

describe('paiementEnLigneAutorise — capacité OU droit acquis (spec 1.1 §1.3)', () => {
  it.each([
    [true, false, true],
    [true, true, true],
    [false, true, true],
    [false, false, false],
  ])('capacité %s, acquis %s → %s', (paiementEnLigne, acquis, attendu) => {
    expect(paiementEnLigneAutorise({ paiementEnLigne }, acquis)).toBe(attendu)
  })
})
