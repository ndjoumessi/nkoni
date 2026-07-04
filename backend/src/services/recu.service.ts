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
 * Découplé de Fastify, Prisma injecté (mockable en test).
 */

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
  const annee = now.getFullYear()

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const versement = await tx.versement.findUnique({
          where: { id: versementId },
          select: { id: true },
        })
        if (!versement) throw new VersementIntrouvableError(versementId)

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
