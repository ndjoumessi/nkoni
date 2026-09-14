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
 *
 * ROTATION de la clé maître (`docs/RUNBOOK_rotation_secrets.md`) : poser la nouvelle clé dans
 * `PSP_ENCRYPTION_KEY` et l'ancienne dans `PSP_ENCRYPTION_KEY_PRECEDENTE`. Le chiffrement utilise
 * TOUJOURS la clé courante ; le déchiffrement essaie la courante puis la précédente, donc aucune
 * configuration ne devient illisible pendant la bascule. `rechiffrerSecret` (script
 * `prisma/rechiffrer-secrets-psp.ts`) réécrit ensuite chaque secret sous la clé courante, après quoi
 * la clé précédente est retirée.
 */

const VERSION = 'v1'
const SEP = ':'

/** Décode une clé 32 octets — accepte base64 (44 car.) ou hex (64 car.). */
function decoderCle(brut: string, nom: string): Buffer {
  const cle = brut.length === 64 ? Buffer.from(brut, 'hex') : Buffer.from(brut, 'base64')
  if (cle.length !== 32) throw new Error(`${nom} doit décoder en 32 octets (AES-256).`)
  return cle
}

/** Résout la clé maître COURANTE (32 octets) depuis l'env. */
function cleMaitre(): Buffer {
  const brut = process.env['PSP_ENCRYPTION_KEY'] ?? ''
  if (!brut) throw new Error('PSP_ENCRYPTION_KEY manquant — chiffrement des secrets PSP impossible.')
  return decoderCle(brut, 'PSP_ENCRYPTION_KEY')
}

/**
 * Clé PRÉCÉDENTE, posée seulement pendant une rotation. Absente → `null`. Mal formée → lève (au
 * premier déchiffrement qui en a besoin) ; `validerClesPsp` permet de le constater dès le démarrage.
 */
function clePrecedente(): Buffer | null {
  const brut = process.env['PSP_ENCRYPTION_KEY_PRECEDENTE'] ?? ''
  return brut ? decoderCle(brut, 'PSP_ENCRYPTION_KEY_PRECEDENTE') : null
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

function dechiffrerAvec(cle: Buffer, enc: string, aad: string): string {
  const parts = enc.split(SEP)
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Format ou version de secret chiffré invalide.')
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string]
  const decipher = createDecipheriv('aes-256-gcm', cle, Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Déchiffre `v1:iv:tag:ciphertext` avec le MÊME `aad` : clé courante d'abord, puis clé précédente si
 * une rotation est en cours. Lève si aucune ne convient (format/version/AAD/contenu).
 */
export function dechiffrerSecret(enc: string, aad: string): string {
  try {
    return dechiffrerAvec(cleMaitre(), enc, aad)
  } catch (err) {
    const precedente = clePrecedente()
    if (!precedente) throw err
    return dechiffrerAvec(precedente, enc, aad)
  }
}

export type ResultatRechiffrement = { statut: 'DEJA_A_JOUR' } | { statut: 'RECHIFFRE'; chiffre: string }

/**
 * Rotation : renvoie `DEJA_A_JOUR` si `enc` se déchiffre avec la clé COURANTE, sinon le déchiffre avec
 * la clé PRÉCÉDENTE et le rechiffre sous la courante (vérifié par un aller-retour avant d'être rendu).
 * Lève si aucune clé ne convient : ce secret-là exige une nouvelle saisie par l'organisation.
 */
export function rechiffrerSecret(enc: string, aad: string): ResultatRechiffrement {
  const courante = cleMaitre()
  try {
    dechiffrerAvec(courante, enc, aad)
    return { statut: 'DEJA_A_JOUR' }
  } catch {
    const precedente = clePrecedente()
    if (!precedente) throw new Error('Secret illisible avec la clé courante, et aucune clé précédente posée.')
    const clair = dechiffrerAvec(precedente, enc, aad)
    const chiffre = chiffrerSecret(clair, aad)
    if (dechiffrerAvec(courante, chiffre, aad) !== clair) throw new Error('Vérification du rechiffrement échouée.')
    return { statut: 'RECHIFFRE', chiffre }
  }
}

export interface EtatClesPsp {
  /** Clé courante absente ou mal formée → message, sinon `null`. */
  erreurCourante: string | null
  /** Clé précédente posée mais mal formée → message, sinon `null`. */
  erreurPrecedente: string | null
  /** Une clé précédente valide est posée : rotation en cours. */
  rotationEnCours: boolean
}

/**
 * Contrôle de forme des deux clés, SANS rien déchiffrer ni afficher de valeur (seuls les noms de
 * variables apparaissent dans les messages). Utilisé par les avertissements de démarrage (`env.ts`) et
 * par le script de rechiffrement, qui doit échouer net plutôt que classer toutes les configurations
 * « illisibles » à cause d'une clé mal saisie.
 */
export function validerClesPsp(): EtatClesPsp {
  let erreurCourante: string | null = null
  let erreurPrecedente: string | null = null
  try {
    cleMaitre()
  } catch (err) {
    erreurCourante = err instanceof Error ? err.message : 'PSP_ENCRYPTION_KEY invalide.'
  }
  let precedente: Buffer | null = null
  try {
    precedente = clePrecedente()
  } catch (err) {
    erreurPrecedente = err instanceof Error ? err.message : 'PSP_ENCRYPTION_KEY_PRECEDENTE invalide.'
  }
  return { erreurCourante, erreurPrecedente, rotationEnCours: precedente !== null }
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
