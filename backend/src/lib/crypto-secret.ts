import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement des SECRETS DE TIERS stockés en base (identifiants PSP par organisation, § paiement) —
 * AES-256-GCM (chiffrement authentifié : toute altération du ciphertext est détectée au déchiffrement
 * via le tag). La clé maître vient de `PSP_ENCRYPTION_KEY` (jamais en base) ; lue à l'appel pour
 * rester testable (un test pose la variable avant d'appeler). Sans clé valide → lève, la config de
 * paiement est simplement indisponible (fail-closed, jamais de stockage en clair).
 *
 * Format de sortie : `iv:tag:ciphertext`, chaque segment en base64. IV aléatoire par chiffrement.
 */

const SEP = ':'

/** Résout la clé maître (32 octets) depuis l'env — accepte base64 (44 car.) ou hex (64 car.). */
function cleMaitre(): Buffer {
  const brut = process.env['PSP_ENCRYPTION_KEY'] ?? ''
  if (!brut) throw new Error('PSP_ENCRYPTION_KEY manquant — chiffrement des secrets PSP impossible.')
  const cle = brut.length === 64 ? Buffer.from(brut, 'hex') : Buffer.from(brut, 'base64')
  if (cle.length !== 32) throw new Error('PSP_ENCRYPTION_KEY doit décoder en 32 octets (AES-256).')
  return cle
}

/** Chiffre une chaîne claire → `iv:tag:ciphertext` (base64). */
export function chiffrerSecret(clair: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cleMaitre(), iv)
  const chiffre = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), chiffre.toString('base64')].join(SEP)
}

/** Déchiffre `iv:tag:ciphertext` → chaîne claire. Lève si le format est invalide ou le contenu altéré. */
export function dechiffrerSecret(enc: string): string {
  const parts = enc.split(SEP)
  if (parts.length !== 3) throw new Error('Format de secret chiffré invalide.')
  const [ivB64, tagB64, dataB64] = parts as [string, string, string]
  const decipher = createDecipheriv('aes-256-gcm', cleMaitre(), Buffer.from(ivB64, 'base64'))
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
