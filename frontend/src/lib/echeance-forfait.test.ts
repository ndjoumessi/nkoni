import { describe, expect, it } from 'vitest'
import { comparerEcheances, estARelancer } from './echeance-forfait'

// Env `node` (défaut des *.test.ts) : fonctions pures.
describe('estARelancer', () => {
  it.each(['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const)('forfait payant en %s → à relancer', (etat) => {
    expect(estARelancer({ forfait: 'PRO', etatForfait: etat })).toBe(true)
  })

  it('forfait payant actif ou sans échéance → rien à relancer', () => {
    expect(estARelancer({ forfait: 'ENTREPRISE', etatForfait: 'ACTIF' })).toBe(false)
    expect(estARelancer({ forfait: 'PRO', etatForfait: 'SANS_ECHEANCE' })).toBe(false)
  })

  it('forfait GRATUIT → jamais à relancer', () => {
    expect(estARelancer({ forfait: 'GRATUIT', etatForfait: 'EXPIRE' })).toBe(false)
  })
})

describe('comparerEcheances', () => {
  it('trie par date croissante, les organisations sans échéance en dernier', () => {
    const lignes = [
      { id: 'sans', forfaitExpireLe: null },
      { id: 'mars', forfaitExpireLe: '2027-03-01T22:59:59.999Z' },
      { id: 'janvier', forfaitExpireLe: '2027-01-01T22:59:59.999Z' },
    ]
    expect([...lignes].sort(comparerEcheances).map((l) => l.id)).toEqual(['janvier', 'mars', 'sans'])
  })
})
