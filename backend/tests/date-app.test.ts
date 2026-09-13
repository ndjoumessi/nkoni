import { describe, it, expect } from 'vitest'
import {
  ajouterMoisApp,
  anneeCouranteApp,
  dateCalendaireApp,
  finDeJourneeApp,
  FUSEAU_APP,
  joursCalendairesEntreApp,
  moisCourantApp,
} from '../src/lib/date-app'

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

describe('date-app — dates calendaires (échéance des forfaits, spec 1.1 §2.4)', () => {
  it('dateCalendaireApp lit le jour de Douala, pas celui du process', () => {
    // 2026-09-12T23:30Z = 13 septembre 00 h 30 à Douala.
    expect(dateCalendaireApp(new Date('2026-09-12T23:30:00Z'))).toBe('2026-09-13')
  })

  it('joursCalendairesEntreApp compte les changements de jour Douala, pas les heures', () => {
    // 23 h 58 le 12 → 00 h 02 le 13 (heure de Douala) : 4 minutes, mais 1 jour calendaire.
    expect(joursCalendairesEntreApp(new Date('2026-09-12T22:58:00Z'), new Date('2026-09-12T23:02:00Z'))).toBe(1)
    expect(joursCalendairesEntreApp(new Date('2026-09-13T10:00:00Z'), new Date('2026-09-13T21:00:00Z'))).toBe(0)
    expect(joursCalendairesEntreApp(new Date('2026-09-13T10:00:00Z'), new Date('2026-08-30T10:00:00Z'))).toBe(-14)
  })

  it('finDeJourneeApp rend 23:59:59.999 heure de Douala du jour applicatif', () => {
    expect(finDeJourneeApp(new Date('2026-09-13T10:00:00Z')).toISOString()).toBe('2026-09-13T22:59:59.999Z')
    // 00 h 30 le 14 à Douala (23 h 30 Z le 13) : c'est la fin du 14 qui est rendue.
    expect(finDeJourneeApp(new Date('2026-09-13T23:30:00Z')).toISOString()).toBe('2026-09-14T22:59:59.999Z')
  })

  it("ajouterMoisApp borne au dernier jour du mois d'arrivée", () => {
    const jour = (iso: string, mois: number) => dateCalendaireApp(ajouterMoisApp(new Date(iso), mois))
    expect(jour('2026-01-31T12:00:00+01:00', 1)).toBe('2026-02-28')
    expect(jour('2028-01-31T12:00:00+01:00', 1)).toBe('2028-02-29')
    expect(jour('2026-08-31T12:00:00+01:00', 3)).toBe('2026-11-30')
    expect(jour('2026-11-15T12:00:00+01:00', 3)).toBe('2027-02-15')
    expect(jour('2026-09-13T12:00:00+01:00', 12)).toBe('2027-09-13')
  })
})
