import { describe, expect, it } from 'vitest'
import { formatTailleOctets } from '../src/lib/i18n'

const MO = 1024 * 1024
const GO = 1024 * MO

describe('formatTailleOctets', () => {
  it('mégaoctets en dessous d’un gigaoctet, arrondi à une décimale', () => {
    expect(formatTailleOctets(480 * MO, 'FR')).toBe('480 Mo')
    expect(formatTailleOctets(480 * MO, 'EN')).toBe('480 MB')
    expect(formatTailleOctets(Math.round(2.54 * MO), 'FR')).toBe('2,5 Mo')
  })

  it('gigaoctets à partir d’un gigaoctet', () => {
    expect(formatTailleOctets(20 * GO, 'FR')).toBe('20 Go')
    expect(formatTailleOctets(1.5 * GO, 'EN')).toBe('1.5 GB')
  })

  it('zéro', () => {
    expect(formatTailleOctets(0, 'FR')).toBe('0 Mo')
  })

  it('choisit l’unité APRÈS arrondi : juste sous 1 Go ne doit pas afficher 1024 Mo', () => {
    expect(formatTailleOctets(GO - 1, 'FR')).toBe('1 Go')
    expect(formatTailleOctets(GO - 1, 'EN')).toBe('1 GB')
  })
})
