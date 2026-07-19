/**
 * Service Reçu de versement — NKONI, section 4.6 (+ modèle Recu §3.1).
 *
 * Génération d'un reçu À LA DEMANDE uniquement (jamais automatique à la saisie d'un
 * Versement). Cette étape se limite à créer l'enregistrement `Recu` avec une
 * numérotation séquentielle fiable ; la génération du PDF (Puppeteer, §1) est une étape
 * ultérieure → `urlPdf` reste `null` ici.
 *
 * Format du numéro : `NKONI-{annee}-{sequence}` avec `sequence` sur 6 chiffres
 * (ex. `NKONI-2026-000123`). L'année est celle de `dateGeneration` (le moment de la
 * génération), PAS celle du versement.
 *
 * Concurrence — stratégie « contrainte d'unicité + retry » :
 *   - La colonne `Recu.numero` porte un index UNIQUE (`Recu_numero_key`). C'est LUI qui
 *     garantit qu'aucun doublon ne peut exister, même sous forte concurrence.
 *   - Le prochain numéro est calculé comme `max(sequence de l'année) + 1` DANS la même
 *     transaction que la création. Si deux transactions concurrentes calculent le même
 *     numéro, l'une réussit et l'autre reçoit une violation d'unicité (P2002) : on
 *     recommence alors la transaction, qui relit le max à jour et prend le numéro
 *     suivant. Simple, portable (aucun SQL brut), et sûr.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test). `now` reste INJECTÉ ; c'est seulement
 * l'extraction de l'ANNÉE qui passe par le fuseau applicatif (une génération le 1ᵉʳ janvier à 00h30
 * à Douala doit numéroter sur la nouvelle année, pas sur celle encore en cours en UTC).
 */

import { anneeCouranteApp } from '../lib/date-app'

/**
 * Levée quand un reçu ACTIF existe déjà pour ce versement. Un versement ne peut porter qu'UN SEUL
 * justificatif valide : deux reçus numérotés actifs pour un même encaissement, ce sont deux
 * justificatifs pour un seul paiement. La séquence correcte est ANNULER puis RÉÉMETTRE — l'annulation
 * libère l'émission d'un nouveau numéro.
 */
export class RecuActifExistantError extends Error {
  readonly numero: string
  constructor(numero: string) {
    super(`Un reçu actif (${numero}) existe déjà pour ce versement.`)
    this.name = 'RecuActifExistantError'
    this.numero = numero
  }
}

/** Levée quand on tente d'annuler un reçu déjà annulé (l'annulation n'est pas rejouable). */
export class RecuDejaAnnuleError extends Error {
  constructor() {
    super('Ce reçu est déjà annulé.')
    this.name = 'RecuDejaAnnuleError'
  }
}

/** Levée quand le reçu visé n'existe pas (ou appartient à une autre organisation). */
export class RecuIntrouvableError extends Error {
  constructor() {
    super('Reçu introuvable.')
    this.name = 'RecuIntrouvableError'
  }
}

/**
 * ANNULE un reçu — annulation COMPTABLE, jamais une suppression : le reçu garde son numéro et sa
 * trace (`annuleLe`, `annuleParId`, `motifAnnulation`). C'est la seule façon de libérer un versement
 * dont un reçu a été émis : les gardes de modification et de suppression ne bloquent que sur un reçu
 * ACTIF (`annuleLe = null`). Supprimer physiquement le document contredirait le garde-fou « pas de
 * reçu orphelin » (FK `onDelete: Restrict`) et laisserait le membre avec un PDF numéroté sans
 * contrepartie en base.
 *
 * `prisma` est volontairement souple (mockable en test, comme les autres services de ce dossier).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function annulerRecu(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  recuId: string,
  annuleParId: string,
  motif?: string,
  maintenant: Date = new Date(),
): Promise<{ id: string; numero: string; annuleLe: Date }> {
  const recu = await prisma.recu.findUnique({
    where: { id: recuId },
    select: { id: true, numero: true, annuleLe: true },
  })
  if (!recu) throw new RecuIntrouvableError()
  if (recu.annuleLe) throw new RecuDejaAnnuleError()

  return prisma.recu.update({
    where: { id: recuId },
    data: {
      annuleLe: maintenant,
      annuleParId,
      ...(motif !== undefined ? { motifAnnulation: motif } : {}),
    },
    select: { id: true, numero: true, annuleLe: true },
  })
}

/** Levée quand le Versement ciblé n'existe pas (→ 404 côté route). */
export class VersementIntrouvableError extends Error {
  readonly versementId: string
  constructor(versementId: string) {
    super(`Versement ${versementId} introuvable : impossible de générer un reçu.`)
    this.name = 'VersementIntrouvableError'
    this.versementId = versementId
  }
}

/** Nombre de chiffres de la partie séquentielle du numéro (ex. 000123). */
const SEQUENCE_PADDING = 6
/** Garde-fou anti-boucle si une collision persiste anormalement. */
const MAX_TENTATIVES = 5

/** Préfixe des numéros d'une année : `NKONI-{annee}-`. */
export function prefixeAnnee(annee: number): string {
  return `NKONI-${annee}-`
}

/** Formate un numéro complet à partir de l'année et de la séquence. */
export function formaterNumero(annee: number, sequence: number): string {
  return `${prefixeAnnee(annee)}${String(sequence).padStart(SEQUENCE_PADDING, '0')}`
}

/** Surface Prisma minimale pour le calcul du numéro (une transaction `tx` ou le client). */
export interface RecuNumeroClient {
  recu: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(args: any): Promise<{ numero: string } | null>
  }
}

/**
 * Calcule le prochain numéro séquentiel pour `annee`, de façon concurrence-safe lorsqu'il
 * est appelé dans la MÊME transaction que la création du Recu (§4.6).
 *
 * On lit le plus grand numéro existant de l'année via `findFirst(orderBy numero desc)` :
 * comme la séquence est un entier zero-paddé à largeur fixe avec un préfixe constant,
 * l'ordre lexicographique coïncide avec l'ordre numérique. On renvoie `max + 1`
 * (ou `...000001` si l'année est vierge).
 */
export async function genererNumeroSequentiel(
  annee: number,
  tx: RecuNumeroClient,
): Promise<string> {
  const prefixe = prefixeAnnee(annee)
  const dernier = await tx.recu.findFirst({
    where: { numero: { startsWith: prefixe } },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })
  const derniereSequence = dernier
    ? Number.parseInt(dernier.numero.slice(prefixe.length), 10)
    : 0
  return formaterNumero(annee, derniereSequence + 1)
}

/** Surface Prisma minimale pour `genererRecu` (mockable en test). */
export interface RecuPrisma extends RecuNumeroClient {
  versement: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
  }
  recu: RecuNumeroClient['recu'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<any>
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

/** Détecte une violation de contrainte d'unicité Prisma (P2002) sans coupler l'import. */
function estConflitUnicite(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

/**
 * Génère un Recu pour un Versement existant (§4.6), à la demande.
 *
 * Déroulé (transaction) :
 *   1. Vérifie que le Versement existe (sinon `VersementIntrouvableError` → 404).
 *   2. Calcule le prochain numéro séquentiel de l'année de `now` (= dateGeneration).
 *   3. Crée le Recu (`urlPdf` non renseigné → null ; le PDF est une étape ultérieure).
 *
 * En cas de collision d'unicité sur `numero` (génération concurrente), la transaction
 * est rejouée jusqu'à `MAX_TENTATIVES` fois — la relecture du max produit alors le
 * numéro suivant.
 *
 * @param now Injecté pour les tests ; l'année du numéro ET `dateGeneration` en découlent
 *            (garantit qu'elles ne peuvent pas diverger à la frontière d'une année).
 */
export async function genererRecu(
  prisma: RecuPrisma,
  versementId: string,
  genereParId: string,
  now: Date = new Date(),
) {
  const annee = anneeCouranteApp(now)

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const versement = await tx.versement.findUnique({
          where: { id: versementId },
          select: { id: true },
        })
        if (!versement) throw new VersementIntrouvableError(versementId)

        // UN SEUL reçu actif par versement. Contrôle DANS la transaction (et non en amont) pour
        // rester sûr en concurrence. Un reçu ANNULÉ ne compte pas : c'est justement ce qui permet
        // la réémission corrigée. N'est PAS un conflit d'unicité → ne déclenche pas la boucle de
        // réessai ci-dessous, l'erreur remonte telle quelle.
        const actif = await tx.recu.findFirst({
          where: { versementId, annuleLe: null },
          select: { numero: true },
        })
        if (actif) throw new RecuActifExistantError(actif.numero)

        const numero = await genererNumeroSequentiel(annee, tx)

        return tx.recu.create({
          data: { versementId, numero, genereParId, dateGeneration: now },
        })
      })
    } catch (err) {
      // Collision de numéro (concurrence) : on rejoue tant qu'il reste des tentatives.
      if (estConflitUnicite(err) && tentative < MAX_TENTATIVES) continue
      throw err
    }
  }

  // Inatteignable en pratique : la boucle retourne ou relance toujours avant d'arriver ici.
  throw new Error(
    `Impossible de générer un numéro de reçu unique après ${MAX_TENTATIVES} tentatives.`,
  )
}
