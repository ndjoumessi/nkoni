import { Prisma } from '../generated/prisma/client'

/**
 * Idempotence des écritures hors-ligne (§ PWA) — garde-fou sur le rejeu.
 *
 * Une écriture idempotente (POST /versements, /membres) porte une `idempotenceKey` cliente,
 * protégée par l'unique `(organisationId, idempotenceKey)`. Un rejeu concurrent lève un P2002
 * sur CETTE contrainte → on renvoie la ligne existante (course bénigne).
 *
 * MAIS un P2002 peut aussi venir d'une AUTRE contrainte unique du même modèle
 * (ex. `(membreId, annee)` d'une Contribution, un unique métier…). Dans ce cas, re-fetch par
 * `idempotenceKey` renverrait la MAUVAISE ligne (ou `null`) et MASQUERAIT une vraie erreur.
 * D'où ce filtre : ne traiter comme rejeu idempotent QUE les P2002 dont `err.meta.target` cible
 * bien la clé d'idempotence ; sinon, l'appelant relève l'erreur.
 */

/**
 * Vrai ssi `err` est une violation de contrainte unique Prisma (P2002) portant sur la clé
 * d'idempotence — l'unique `(organisationId, idempotenceKey)`.
 *
 * `err.meta.target` vaut, selon le moteur / l'adaptateur :
 *   - le NOM de la contrainte (string), ex. « Versement_organisationId_idempotenceKey_key » ;
 *   - ou la LISTE des champs (string[]), ex. `['organisationId', 'idempotenceKey']`.
 * Dans les deux cas, la présence de « idempotenceKey » signe la bonne contrainte. Toute autre
 * cible (ou une cible absente / d'un autre type) renvoie `false`.
 */
export function estConflitIdempotence(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false
  }
  const target = (err.meta as { target?: unknown } | undefined)?.target
  if (typeof target === 'string') return target.includes('idempotenceKey')
  if (Array.isArray(target)) return target.some((c) => c === 'idempotenceKey')
  return false
}
