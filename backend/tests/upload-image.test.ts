import { describe, it, expect } from 'vitest'
import { validerImageTeleversee, TAILLE_MAX_IMAGE } from '../src/lib/upload-image'

/**
 * Validateur d'image PARTAGÉ par /membres/:id/photo (bureau) et /moi/photo (self-service). C'est le
 * contrôle critique d'un téléversement : il empêche qu'un fichier arbitraire soit accepté parce que
 * son Content-Type ment. Le couvrir ici verrouille le comportement des DEUX routes d'un coup — un
 * resserrement futur (nouveau MIME, plafond abaissé) ne peut plus diverger d'un côté sans virer au rouge.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]) // magic JPEG
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]) // magic PNG

describe('validerImageTeleversee', () => {
  it('accepte un JPEG valide (magic bytes cohérents) → null', () => {
    expect(validerImageTeleversee({ buffer: JPEG, mimetype: 'image/jpeg' })).toBeNull()
  })

  it('accepte un PNG valide → null', () => {
    expect(validerImageTeleversee({ buffer: PNG, mimetype: 'image/png' })).toBeNull()
  })

  it('refuse un MIME hors allowlist (GIF, PDF) → TYPE_INVALIDE', () => {
    expect(validerImageTeleversee({ buffer: JPEG, mimetype: 'image/gif' })).toBe('TYPE_INVALIDE')
    expect(validerImageTeleversee({ buffer: JPEG, mimetype: 'application/pdf' })).toBe('TYPE_INVALIDE')
  })

  it('refuse un Content-Type qui MENT (octets PNG déclarés image/jpeg) → TYPE_INVALIDE', () => {
    expect(validerImageTeleversee({ buffer: PNG, mimetype: 'image/jpeg' })).toBe('TYPE_INVALIDE')
  })

  it('refuse des octets arbitraires même sous un MIME autorisé → TYPE_INVALIDE', () => {
    expect(validerImageTeleversee({ buffer: Buffer.from('pas une image'), mimetype: 'image/png' })).toBe('TYPE_INVALIDE')
  })

  it('refuse au-delà du plafond (5 Mo) → TROP_VOLUMINEUX', () => {
    const gros = Buffer.concat([JPEG, Buffer.alloc(TAILLE_MAX_IMAGE)])
    expect(validerImageTeleversee({ buffer: gros, mimetype: 'image/jpeg' })).toBe('TROP_VOLUMINEUX')
  })

  it('vérifie le TYPE avant la TAILLE (gros fichier de mauvais type → TYPE_INVALIDE)', () => {
    const gros = Buffer.alloc(TAILLE_MAX_IMAGE + 1)
    expect(validerImageTeleversee({ buffer: gros, mimetype: 'image/gif' })).toBe('TYPE_INVALIDE')
  })
})
