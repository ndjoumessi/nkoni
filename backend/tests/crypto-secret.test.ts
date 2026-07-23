import { describe, it, expect, beforeAll } from 'vitest'
import { chiffrerSecret, dechiffrerSecret, chiffrementPspDisponible } from '../src/lib/crypto-secret'

/** Chiffrement des secrets PSP (AES-256-GCM). Pur, sans base : on pose une clé de test 32 octets. */
beforeAll(() => {
  process.env['PSP_ENCRYPTION_KEY'] = Buffer.alloc(32, 7).toString('base64')
})

const ORG = 'org-aad-1'

describe('crypto-secret (AES-256-GCM + AAD + version)', () => {
  it('round-trip avec le MÊME AAD : dechiffrer(chiffrer(x)) === x', () => {
    const clair = JSON.stringify({ apiUser: 'u', apiKey: 'k', environnement: 'SANDBOX' })
    expect(dechiffrerSecret(chiffrerSecret(clair, ORG), ORG)).toBe(clair)
  })

  it('format versionné `v1:iv:tag:ciphertext`', () => {
    const parts = chiffrerSecret('x', ORG).split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
  })

  it('deux chiffrements du même clair diffèrent (IV aléatoire)', () => {
    expect(chiffrerSecret('x', ORG)).not.toBe(chiffrerSecret('x', ORG))
  })

  it('AAD différent → déchiffrement REFUSÉ (secret non recopiable d’une org à l’autre)', () => {
    const enc = chiffrerSecret('secret', ORG)
    expect(() => dechiffrerSecret(enc, 'autre-org')).toThrow()
    expect(dechiffrerSecret(enc, ORG)).toBe('secret')
  })

  it('détecte une altération du ciphertext (tag GCM)', () => {
    const [v, iv, tag] = chiffrerSecret('secret', ORG).split(':')
    const altere = [v, iv, tag, Buffer.from('donnees-falsifiees').toString('base64')].join(':')
    expect(() => dechiffrerSecret(altere, ORG)).toThrow()
  })

  it('mauvaise version / format → lève', () => {
    expect(() => dechiffrerSecret('v2:a:b:c', ORG)).toThrow()
    expect(() => dechiffrerSecret('pas-un-format-valide', ORG)).toThrow()
  })

  it('chiffrementPspDisponible = true avec une clé valide', () => {
    expect(chiffrementPspDisponible()).toBe(true)
  })

  it('clé absente → chiffrer lève, chiffrementPspDisponible = false', () => {
    const sauve = process.env['PSP_ENCRYPTION_KEY']
    delete process.env['PSP_ENCRYPTION_KEY']
    try {
      expect(chiffrementPspDisponible()).toBe(false)
      expect(() => chiffrerSecret('x', ORG)).toThrow()
    } finally {
      process.env['PSP_ENCRYPTION_KEY'] = sauve
    }
  })
})
