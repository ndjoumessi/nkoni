import { describe, it, expect } from 'vitest'
import { normaliserTelephone } from '../src/lib/telephone'

/**
 * Normalisation E.164 sans « + » (défaut Cameroun, indicatif 237). Fonction PURE.
 */
describe('normaliserTelephone', () => {
  it('local 6XXXXXXXX → préfixé 237', () => {
    expect(normaliserTelephone('690000000')).toBe('237690000000')
    expect(normaliserTelephone('677123456')).toBe('237677123456')
  })

  it('déjà international (237…) → conservé', () => {
    expect(normaliserTelephone('237690000000')).toBe('237690000000')
  })

  it('nettoie espaces, tirets, points, parenthèses et le « + »', () => {
    expect(normaliserTelephone('690 00 00 00')).toBe('237690000000')
    expect(normaliserTelephone('6-90-00-00-00')).toBe('237690000000')
    expect(normaliserTelephone('+237 690.00.00.00')).toBe('237690000000')
    expect(normaliserTelephone('(237) 690 000 000')).toBe('237690000000')
  })

  it('préfixe d’appel international 00 (équivalent +) → traité comme international', () => {
    expect(normaliserTelephone('00237690000000')).toBe('237690000000')
  })

  it('numéro invalide → null (trop court, mauvais préfixe, vide, abonné non 6…)', () => {
    expect(normaliserTelephone('690')).toBeNull() // trop court
    expect(normaliserTelephone('12')).toBeNull()
    expect(normaliserTelephone('')).toBeNull()
    expect(normaliserTelephone(null)).toBeNull()
    expect(normaliserTelephone(undefined)).toBeNull()
    expect(normaliserTelephone('lettres')).toBeNull()
    expect(normaliserTelephone('790000000')).toBeNull() // abonné ne commence pas par 6
    expect(normaliserTelephone('237790000000')).toBeNull() // international mais abonné invalide
    expect(normaliserTelephone('2376900000000')).toBeNull() // un chiffre de trop
  })

  it('indicatif pays paramétrable (futur multi-pays)', () => {
    // Avec un autre indicatif, un abonné local valide (règle Cameroun) est préfixé de cet indicatif.
    expect(normaliserTelephone('690000000', '241')).toBe('241690000000')
  })
})
