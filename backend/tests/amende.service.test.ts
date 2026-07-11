import { describe, it, expect } from 'vitest'
import {
  estEditableAmende,
  validerTransitionAmende,
  totauxAmendes,
  TransitionAmendeInvalideError,
} from '../src/services/amende.service'

describe('amende.service (§4.10) — logique pure', () => {
  it('estEditableAmende seulement si IMPAYEE', () => {
    expect(estEditableAmende('IMPAYEE')).toBe(true)
    expect(estEditableAmende('PAYEE')).toBe(false)
    expect(estEditableAmende('ANNULEE')).toBe(false)
  })

  it('validerTransitionAmende : IMPAYEE→PAYEE|ANNULEE autorisées, le reste rejeté', () => {
    expect(() => validerTransitionAmende('IMPAYEE', 'PAYEE')).not.toThrow()
    expect(() => validerTransitionAmende('IMPAYEE', 'ANNULEE')).not.toThrow()
    expect(() => validerTransitionAmende('PAYEE', 'IMPAYEE')).toThrow(TransitionAmendeInvalideError)
    expect(() => validerTransitionAmende('ANNULEE', 'PAYEE')).toThrow(TransitionAmendeInvalideError)
    expect(() => validerTransitionAmende('PAYEE', 'ANNULEE')).toThrow(TransitionAmendeInvalideError)
  })

  it('totauxAmendes : dû = Σ IMPAYEE, encaissé = Σ PAYEE, ANNULEE exclues', () => {
    const r = totauxAmendes([
      { montant: 5000, statut: 'IMPAYEE' },
      { montant: 2000, statut: 'IMPAYEE' },
      { montant: 3000, statut: 'PAYEE' },
      { montant: 9999, statut: 'ANNULEE' },
    ])
    expect(r).toEqual({ du: 7000, encaisse: 3000 })
    expect(totauxAmendes([])).toEqual({ du: 0, encaisse: 0 })
  })
})
