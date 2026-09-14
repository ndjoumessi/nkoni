import { describe, expect, it } from 'vitest'
import { formatTailleOctets } from './format'

// Env `node` : i18n non initialisé → locale `fr` (défaut de `locale()`).
const MO = 1024 * 1024
const GO = 1024 * MO

describe('formatTailleOctets (front)', () => {
  it('Mo sous 1 Go, Go au-delà, une décimale au plus', () => {
    expect(formatTailleOctets(480 * MO)).toBe('480 Mo')
    expect(formatTailleOctets(Math.round(2.54 * MO))).toBe('2,5 Mo')
    expect(formatTailleOctets(20 * GO)).toBe('20 Go')
    expect(formatTailleOctets(0)).toBe('0 Mo')
  })

  it('choisit l’unité APRÈS arrondi : juste sous 1 Go ne doit pas afficher 1024 Mo', () => {
    expect(formatTailleOctets(GO - 1)).toBe('1 Go')
  })
})
