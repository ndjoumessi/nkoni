import { describe, it, expect } from 'vitest'
import {
  collecteCagnotte,
  soldeCagnotte,
  progressionCagnotte,
  estEditableCagnotte,
  validerReversement,
  ReversementInvalideError,
} from '../src/services/cagnotte.service'

describe('cagnotte.service (§4.9) — logique pure', () => {
  it('collecteCagnotte somme les dons', () => {
    expect(collecteCagnotte([{ montant: 5000 }, { montant: 2500 }, { montant: 500 }])).toBe(8000)
    expect(collecteCagnotte([])).toBe(0)
  })

  it('soldeCagnotte = collecté − reversé, borné à 0', () => {
    expect(soldeCagnotte(8000, 3000)).toBe(5000)
    expect(soldeCagnotte(8000, 8000)).toBe(0)
    expect(soldeCagnotte(8000, 9000)).toBe(0) // jamais négatif à l'affichage
  })

  it('progressionCagnotte : % entier borné à 100, null sans objectif', () => {
    expect(progressionCagnotte(5000, 10000)).toBe(50)
    expect(progressionCagnotte(12000, 10000)).toBe(100) // borné
    expect(progressionCagnotte(3333, 10000)).toBe(33) // arrondi
    expect(progressionCagnotte(5000, null)).toBeNull()
    expect(progressionCagnotte(5000, 0)).toBeNull()
  })

  it('estEditableCagnotte seulement si OUVERTE', () => {
    expect(estEditableCagnotte('OUVERTE')).toBe(true)
    expect(estEditableCagnotte('CLOTUREE')).toBe(false)
  })

  it('validerReversement accepte [0, collecte], rejette hors bornes', () => {
    expect(() => validerReversement(0, 8000)).not.toThrow()
    expect(() => validerReversement(8000, 8000)).not.toThrow()
    expect(() => validerReversement(3000, 8000)).not.toThrow()
    expect(() => validerReversement(-1, 8000)).toThrow(ReversementInvalideError)
    expect(() => validerReversement(8001, 8000)).toThrow(ReversementInvalideError)
  })
})
