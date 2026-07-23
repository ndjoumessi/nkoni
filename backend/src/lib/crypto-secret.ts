import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement des SECRETS DE TIERS stockés en base (identifiants PSP par organisation, § paiement) —
 * AES-256-GCM (chiffrement authentifié : toute altération du ciphertext est détectée via le tag). La
 * clé maître vient de `PSP_ENCRYPTION_KEY` (jamais en base) ; lue à l'appel pour rester testable.
 * Sans clé valide → lève, la config de paiement est simplement indisponible (fail-closed).
 *
 * Deux durcissements posés AVANT toute mise en service (aucune donnée à migrer tant que la table est
 * vide) :
 *   1. VERSION de format (`v1:`) — une rotation d'algorithme/clé future pourra coexister avec l'ancien
 *      format au lieu d'exiger un re-chiffrement en bloc.
 *   2. AAD = `organisationId` — le ciphertext est LIÉ à son organisation : un secret ne peut pas être
 *      recopié d'une org vers une autre en base (le déchiffrement échoue si l'AAD ne correspond pas),
 *      défense en profondeur au-delà de l'extension d'isolation.
 *
 * Format : `v1:iv:tag:ciphertext` (segments base64).
 */

const VERSION = 'v1'
const SEP = ':'

/** Résout la clé maître (32 octets) depuis l'env — accepte base64 (44 car.) ou hex (64 car.). */
function cleMaitre(): Buffer {
  const brut = process.env['PSP_ENCRYPTION_KEY'] ?? ''
  if (!brut) throw new Error('PSP_ENCRYPTION_KEY manquant — chiffrement des secrets PSP impossible.')
  const cle = brut.length === 64 ? Buffer.from(brut, 'hex') : Buffer.from(brut, 'base64')
  if (cle.length !== 32) throw new Error('PSP_ENCRYPTION_KEY doit décoder en 32 octets (AES-256).')
  return cle
}

/**
 * Chiffre `clair` en le LIANT à `aad` (l'`organisationId`) → `v1:iv:tag:ciphertext`.
 * Le même `aad` sera exigé au déchiffrement.
 */
export function chiffrerSecret(clair: string, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cleMaitre(), iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const chiffre = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), chiffre.toString('base64')].join(SEP)
}

/** Déchiffre `v1:iv:tag:ciphertext` avec le MÊME `aad`. Lève si format/version/AAD/contenu ne collent pas. */
export function dechiffrerSecret(enc: string, aad: string): string {
  const parts = enc.split(SEP)
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Format ou version de secret chiffré invalide.')
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string]
  const decipher = createDecipheriv('aes-256-gcm', cleMaitre(), Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/** True si une clé de chiffrement PSP valide est configurée (sinon la config paiement est indisponible). */
export function chiffrementPspDisponible(): boolean {
  try {
    cleMaitre()
    return true
  } catch {
    return false
  }
}
