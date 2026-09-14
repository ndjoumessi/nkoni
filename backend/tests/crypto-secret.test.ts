import { describe, it, expect, beforeAll } from 'vitest'
import { chiffrerSecret, dechiffrerSecret, chiffrementPspDisponible, rechiffrerSecret } from '../src/lib/crypto-secret'

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

/**
 * Rotation de la clé maître (`docs/RUNBOOK_rotation_secrets.md`) : ancienne clé en
 * `PSP_ENCRYPTION_KEY_PRECEDENTE`, nouvelle en `PSP_ENCRYPTION_KEY`.
 */
describe('crypto-secret — rotation de la clé maître', () => {
  const ANCIENNE = Buffer.alloc(32, 7).toString('base64')
  const NOUVELLE = Buffer.alloc(32, 9).toString('hex')

  const avecCles = <T>(courante: string, precedente: string | undefined, fn: () => T): T => {
    const sauve = { c: process.env['PSP_ENCRYPTION_KEY'], p: process.env['PSP_ENCRYPTION_KEY_PRECEDENTE'] }
    process.env['PSP_ENCRYPTION_KEY'] = courante
    if (precedente === undefined) delete process.env['PSP_ENCRYPTION_KEY_PRECEDENTE']
    else process.env['PSP_ENCRYPTION_KEY_PRECEDENTE'] = precedente
    try {
      return fn()
    } finally {
      process.env['PSP_ENCRYPTION_KEY'] = sauve.c
      if (sauve.p === undefined) delete process.env['PSP_ENCRYPTION_KEY_PRECEDENTE']
      else process.env['PSP_ENCRYPTION_KEY_PRECEDENTE'] = sauve.p
    }
  }

  const ancienSecret = () => avecCles(ANCIENNE, undefined, () => chiffrerSecret('identifiants', ORG))

  it('nouvelle clé SANS clé précédente : un ancien secret est illisible (le danger que la rotation évite)', () => {
    const enc = ancienSecret()
    avecCles(NOUVELLE, undefined, () => expect(() => dechiffrerSecret(enc, ORG)).toThrow())
  })

  it('pendant la bascule : ancien secret lisible via la clé précédente, nouveaux secrets sous la courante', () => {
    const enc = ancienSecret()
    avecCles(NOUVELLE, ANCIENNE, () => {
      expect(dechiffrerSecret(enc, ORG)).toBe('identifiants')
      const neuf = chiffrerSecret('neuf', ORG)
      expect(avecCles(NOUVELLE, undefined, () => dechiffrerSecret(neuf, ORG))).toBe('neuf')
    })
  })

  it('la clé précédente ne contourne ni l’AAD ni le tag GCM', () => {
    const enc = ancienSecret()
    avecCles(NOUVELLE, ANCIENNE, () => {
      expect(() => dechiffrerSecret(enc, 'autre-org')).toThrow()
      const [v, iv, tag] = enc.split(':')
      expect(() => dechiffrerSecret([v, iv, tag, Buffer.from('falsifie').toString('base64')].join(':'), ORG)).toThrow()
    })
  })

  it('rechiffrerSecret : ancien → RECHIFFRE, lisible ensuite SANS la clé précédente', () => {
    const enc = ancienSecret()
    const r = avecCles(NOUVELLE, ANCIENNE, () => rechiffrerSecret(enc, ORG))
    expect(r.statut).toBe('RECHIFFRE')
    if (r.statut !== 'RECHIFFRE') return
    expect(avecCles(NOUVELLE, undefined, () => dechiffrerSecret(r.chiffre, ORG))).toBe('identifiants')
  })

  it('rechiffrerSecret : secret déjà sous la clé courante → DEJA_A_JOUR (idempotent)', () => {
    const enc = avecCles(NOUVELLE, undefined, () => chiffrerSecret('x', ORG))
    expect(avecCles(NOUVELLE, ANCIENNE, () => rechiffrerSecret(enc, ORG))).toEqual({ statut: 'DEJA_A_JOUR' })
  })

  it('rechiffrerSecret : illisible avec les deux clés → lève (nouvelle saisie requise)', () => {
    const enc = avecCles(Buffer.alloc(32, 3).toString('base64'), undefined, () => chiffrerSecret('x', ORG))
    avecCles(NOUVELLE, ANCIENNE, () => expect(() => rechiffrerSecret(enc, ORG)).toThrow())
    avecCles(NOUVELLE, undefined, () => expect(() => rechiffrerSecret(enc, ORG)).toThrow())
  })

  it('clé précédente mal formée → lève (une rotation mal saisie se voit tout de suite)', () => {
    const enc = ancienSecret()
    avecCles(NOUVELLE, 'trop-courte', () => expect(() => dechiffrerSecret(enc, ORG)).toThrow(/PSP_ENCRYPTION_KEY_PRECEDENTE/))
  })
})
