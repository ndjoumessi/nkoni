import { describe, expect, it } from 'vitest'
import { comparerEcheances, estARelancer, estPayantSansEcheance } from './echeance-forfait'

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

describe('estPayantSansEcheance', () => {
  it.each(['PRO', 'ENTREPRISE'] as const)('%s sans échéance → signalé', (forfait) => {
    expect(estPayantSansEcheance({ forfait, etatForfait: 'SANS_ECHEANCE' })).toBe(true)
  })

  it('GRATUIT (toujours sans échéance) → jamais signalé', () => {
    expect(estPayantSansEcheance({ forfait: 'GRATUIT', etatForfait: 'SANS_ECHEANCE' })).toBe(false)
  })

  it.each(['ACTIF', 'ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const)('payant avec échéance (%s) → non signalé', (etat) => {
    expect(estPayantSansEcheance({ forfait: 'PRO', etatForfait: etat })).toBe(false)
  })

  it('état absent (front déployé avant le backend) → non signalé', () => {
    expect(estPayantSansEcheance({ forfait: 'PRO', etatForfait: undefined })).toBe(false)
    expect(estPayantSansEcheance({ forfait: 'PRO', etatForfait: null })).toBe(false)
  })

  it('jamais à la fois « à relancer » et « sans échéance » (filtres exclusifs sans perte)', () => {
    for (const forfait of ['GRATUIT', 'PRO', 'ENTREPRISE'] as const) {
      for (const etatForfait of ['SANS_ECHEANCE', 'ACTIF', 'ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const) {
        const o = { forfait, etatForfait }
        expect(estARelancer(o) && estPayantSansEcheance(o)).toBe(false)
      }
    }
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

  it('en tri décroissant, les organisations sans échéance restent en dernier', () => {
    const lignes = [
      { id: 'sans', forfaitExpireLe: null },
      { id: 'janvier', forfaitExpireLe: '2027-01-01T22:59:59.999Z' },
      { id: 'mars', forfaitExpireLe: '2027-03-01T22:59:59.999Z' },
    ]
    expect([...lignes].sort((a, b) => comparerEcheances(a, b, 'desc')).map((l) => l.id)).toEqual(['mars', 'janvier', 'sans'])
  })
})
