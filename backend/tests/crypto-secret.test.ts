import { describe, it, expect, beforeAll } from 'vitest'
import { chiffrerSecret, dechiffrerSecret, chiffrementPspDisponible } from '../src/lib/crypto-secret'

/** Chiffrement des secrets PSP (AES-256-GCM). Pur, sans base : on pose une clé de test 32 octets. */
beforeAll(() => {
  process.env['PSP_ENCRYPTION_KEY'] = Buffer.alloc(32, 7).toString('base64')
})

describe('crypto-secret (AES-256-GCM)', () => {
  it('round-trip : dechiffrer(chiffrer(x)) === x', () => {
    const clair = JSON.stringify({ apiUser: 'u', apiKey: 'k', environnement: 'SANDBOX' })
    expect(dechiffrerSecret(chiffrerSecret(clair))).toBe(clair)
  })

  it('deux chiffrements du même clair diffèrent (IV aléatoire)', () => {
    expect(chiffrerSecret('x')).not.toBe(chiffrerSecret('x'))
  })

  it('détecte une altération du ciphertext (tag GCM)', () => {
    const enc = chiffrerSecret('secret')
    const [iv, tag] = enc.split(':')
    const altere = [iv, tag, Buffer.from('donnees-falsifiees').toString('base64')].join(':')
    expect(() => dechiffrerSecret(altere)).toThrow()
  })

  it('format invalide → lève', () => {
    expect(() => dechiffrerSecret('pas-un-format-valide')).toThrow()
  })

  it('chiffrementPspDisponible = true avec une clé valide', () => {
    expect(chiffrementPspDisponible()).toBe(true)
  })

  it('clé absente → chiffrer lève, chiffrementPspDisponible = false', () => {
    const sauve = process.env['PSP_ENCRYPTION_KEY']
    delete process.env['PSP_ENCRYPTION_KEY']
    try {
      expect(chiffrementPspDisponible()).toBe(false)
      expect(() => chiffrerSecret('x')).toThrow()
    } finally {
      process.env['PSP_ENCRYPTION_KEY'] = sauve
    }
  })
})
