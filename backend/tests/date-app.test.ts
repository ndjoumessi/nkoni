import { describe, it, expect } from 'vitest'
import { anneeCouranteApp, moisCourantApp, FUSEAU_APP } from '../src/lib/date-app'

/**
 * Le process tourne en UTC (Railway), l'organisation vit en `Africa/Douala` (UTC+1). Ces tests
 * pinnent l'écart : ils passent une DATE FIXE (jamais l'horloge réelle) placée dans la fenêtre
 * d'une heure où les deux fuseaux ne sont pas dans la même période.
 */
describe('date-app — fuseau applicatif', () => {
  it('cible bien Africa/Douala', () => {
    expect(FUSEAU_APP).toBe('Africa/Douala')
  })

  it('rend l’année de Douala, pas celle du process, le 1ᵉʳ janvier à 00h30 locale', () => {
    // 2025-12-31T23:30Z = 2026-01-01T00:30 à Douala : l'ouverture de 2026 doit être permise.
    const instant = new Date('2025-12-31T23:30:00Z')
    expect(instant.getUTCFullYear()).toBe(2025)
    expect(anneeCouranteApp(instant)).toBe(2026)
  })

  it('rend le mois de Douala le 1er du mois à 00h30 locale', () => {
    // 2026-02-28T23:30Z = 2026-03-01T00:30 à Douala : mars, pas février.
    expect(moisCourantApp(new Date('2026-02-28T23:30:00Z'))).toBe(3)
  })

  it('reste aligné sur UTC hors de la fenêtre de décalage', () => {
    const instant = new Date('2026-07-19T12:00:00Z')
    expect(anneeCouranteApp(instant)).toBe(2026)
    expect(moisCourantApp(instant)).toBe(7)
  })

  it('rend des nombres exploitables (mois 1→12, pas 0→11)', () => {
    const janvier = new Date('2026-01-15T12:00:00Z')
    expect(moisCourantApp(janvier)).toBe(1)
    expect(Number.isInteger(anneeCouranteApp(janvier))).toBe(true)
  })
})
