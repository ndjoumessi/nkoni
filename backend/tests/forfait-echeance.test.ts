import { describe, expect, it } from 'vitest'
import {
  etatForfait,
  forfaitEffectif,
  joursRestants,
  nouvelleEcheance,
  vueEcheance,
} from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

/**
 * Échéance des forfaits (spec 1.1 §2.3–§2.5). Horloge FIXE : 13 septembre 2026, 11 h à Douala. Les
 * échéances sont des fins de journée Douala (`fin('AAAA-MM-JJ')`), comme en production.
 */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('joursRestants', () => {
  it('0 le dernier jour payé, négatif après, en jours calendaires Douala', () => {
    expect(joursRestants(fin('2026-09-13'), NOW)).toBe(0)
    expect(joursRestants(fin('2026-09-12'), NOW)).toBe(-1)
    expect(joursRestants(fin('2026-10-13'), NOW)).toBe(30)
  })

  it('bascule à minuit DOUALA, pas à minuit UTC', () => {
    // 23 h 30 Z le 12 = 00 h 30 le 13 à Douala : l'échéance du 13 est « aujourd'hui » (0), pas « demain ».
    expect(joursRestants(fin('2026-09-13'), new Date('2026-09-12T23:30:00Z'))).toBe(0)
  })
})

describe('etatForfait — bornes exactes', () => {
  it.each([
    ['2026-10-14', 31, 'ACTIF'],
    ['2026-10-13', 30, 'ECHEANCE_PROCHE'],
    ['2026-09-13', 0, 'ECHEANCE_PROCHE'],
    ['2026-09-12', -1, 'GRACE'],
    ['2026-08-30', -14, 'GRACE'],
    ['2026-08-29', -15, 'EXPIRE'],
  ] as const)('échéance %s (J = %i) → %s', (jour, j, etat) => {
    expect(joursRestants(fin(jour), NOW)).toBe(j)
    expect(etatForfait('PRO', fin(jour), NOW)).toBe(etat)
  })

  it('sans date ou forfait GRATUIT → SANS_ECHEANCE', () => {
    expect(etatForfait('PRO', null, NOW)).toBe('SANS_ECHEANCE')
    expect(etatForfait('GRATUIT', fin('2026-08-01'), NOW)).toBe('SANS_ECHEANCE')
  })
})

describe('forfaitEffectif', () => {
  it('GRATUIT une fois la grâce écoulée, le forfait enregistré avant', () => {
    expect(forfaitEffectif('PRO', fin('2026-08-29'), NOW)).toBe('GRATUIT')
    expect(forfaitEffectif('ENTREPRISE', fin('2026-08-30'), NOW)).toBe('ENTREPRISE')
    expect(forfaitEffectif('PRO', null, NOW)).toBe('PRO')
    expect(forfaitEffectif('GRATUIT', null, NOW)).toBe('GRATUIT')
  })
})

describe('nouvelleEcheance', () => {
  it("avant l'échéance : prolonge depuis l'ancienne échéance", () => {
    expect(nouvelleEcheance(fin('2026-10-20'), NOW, 1)).toEqual(fin('2026-11-20'))
  })

  it("pendant la grâce : repart de l'ancienne échéance (la grâce n'est pas offerte)", () => {
    expect(nouvelleEcheance(fin('2026-09-08'), NOW, 3)).toEqual(fin('2026-12-08'))
  })

  it("après la grâce : repart d'aujourd'hui", () => {
    expect(nouvelleEcheance(fin('2026-08-29'), NOW, 1)).toEqual(fin('2026-10-13'))
  })

  it("sans échéance : repart d'aujourd'hui", () => {
    expect(nouvelleEcheance(null, NOW, 12)).toEqual(fin('2027-09-13'))
  })

  it("borne au dernier jour du mois et rend une fin de journée Douala", () => {
    expect(nouvelleEcheance(fin('2027-01-31'), NOW, 1)).toEqual(fin('2027-02-28'))
    expect(nouvelleEcheance(null, NOW, 1).toISOString()).toBe('2026-10-13T22:59:59.999Z')
  })
})

describe('vueEcheance', () => {
  it("en grâce : état, jours restants, fin de grâce et forfait effectif", () => {
    expect(vueEcheance('PRO', fin('2026-09-12'), NOW)).toEqual({
      forfaitExpireLe: fin('2026-09-12'),
      etatForfait: 'GRACE',
      joursRestants: -1,
      finGraceLe: fin('2026-09-26'),
      forfaitEffectif: 'PRO',
    })
  })

  it("sans échéance : jours restants et fin de grâce à null", () => {
    expect(vueEcheance('GRATUIT', null, NOW)).toEqual({
      forfaitExpireLe: null,
      etatForfait: 'SANS_ECHEANCE',
      joursRestants: null,
      finGraceLe: null,
      forfaitEffectif: 'GRATUIT',
    })
  })
})
