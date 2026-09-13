import { describe, expect, it } from 'vitest'
import { etapeRelanceForfait } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

/** Horloge FIXE : 13 septembre 2026, 11 h à Douala ; échéances = fins de journée Douala. */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('etapeRelanceForfait — étape la plus récente atteinte (spec 1.1 §4.1)', () => {
  it.each([
    ['2026-10-14', 31, null],
    ['2026-10-13', 30, 'J30'],
    ['2026-09-21', 8, 'J30'],
    ['2026-09-20', 7, 'J7'],
    ['2026-09-15', 2, 'J7'],
    ['2026-09-14', 1, 'J1'],
    ['2026-09-13', 0, 'J1'],
    ['2026-09-12', -1, 'GRACE'],
    ['2026-08-30', -14, 'GRACE'],
    ['2026-08-29', -15, null],
  ] as const)('échéance %s (J = %i) → %s', (jour, _j, etape) => {
    expect(etapeRelanceForfait('PRO', fin(jour), NOW)).toBe(etape)
  })

  it('GRATUIT ou sans échéance → aucune relance', () => {
    expect(etapeRelanceForfait('GRATUIT', fin('2026-09-20'), NOW)).toBeNull()
    expect(etapeRelanceForfait('ENTREPRISE', null, NOW)).toBeNull()
  })
})
