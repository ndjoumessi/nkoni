import { Prisma } from '../generated/prisma/client'

/**
 * Cœur métier des VERSEMENTS (§5) — extrait des routes (audit M1) pour que l'INVARIANT COMPTABLE
 * central vive à UN SEUL endroit : à toute écriture d'un Versement, `Contribution.montantVerse` ET
 * `Contribution.montantValorise` sont ajustés du MÊME delta, DANS la transaction fournie par
 * l'appelant. `montantValorise` est INCRÉMENTÉ (jamais réinitialisé : il peut refléter un
 * équilibrage antérieur). Fonctions PURES au sens I/O : la transaction Prisma (`tx`) est injectée
 * → testables sur mock, réutilisables par tout futur chemin (import, rejeu, tâche) sans dupliquer
 * la logique de delta. AUCUNE génération de Reçu ici (garde §4.6).
 *
 * `tx` est typé `any` (comme les autres services) pour rester compatible avec le mock Prisma des
 * tests et avec le client `$transaction` interactif réel.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Suppression refusée : un reçu (preuve de paiement, potentiellement déjà partagé) a été émis. */
export class VersementAvecRecuError extends Error {
  constructor() {
    super('Versement avec reçu émis : suppression interdite.')
    this.name = 'VersementAvecRecuError'
  }
}

function introuvable(): never {
  throw new Prisma.PrismaClientKnownRequestError('Versement introuvable', {
    code: 'P2025',
    clientVersion: 'nkoni',
  })
}

/** Crée le versement puis incrémente montantVerse ET montantValorise du montant (invariant §5). */
export async function appliquerCreationVersement(
  tx: any,
  data: any,
): Promise<{ versement: any; contribution: any }> {
  const versement = await tx.versement.create({ data })
  const contribution = await tx.contribution.update({
    where: { id: data.contributionId },
    data: {
      montantVerse: { increment: data.montant },
      montantValorise: { increment: data.montant },
    },
  })
  return { versement, contribution }
}

export interface PatchVersement {
  montant?: number
  dateVersement?: Date
  mode?: string
  note?: string
}

/**
 * Met à jour le versement et reporte le DELTA de montant sur la contribution (même delta sur les deux).
 * REFUSE (VersementAvecRecuError) si un reçu ACTIF a été émis : sans cette garde, on pouvait changer
 * le montant d'un versement dont le reçu numéroté était déjà remis au membre — le reçu se serait mis
 * à mentir. Garde SYMÉTRIQUE de celle de la suppression ; annuler le reçu débloque les deux.
 */
export async function appliquerModificationVersement(
  tx: any,
  id: string,
  patch: PatchVersement,
): Promise<any> {
  const existing = await tx.versement.findUnique({ where: { id } })
  if (!existing) introuvable()

  const recuActif = await tx.recu.findFirst({
    where: { versementId: id, annuleLe: null },
    select: { id: true },
  })
  if (recuActif) throw new VersementAvecRecuError()

  const data: any = {}
  if (patch.montant !== undefined) data.montant = patch.montant
  if (patch.dateVersement !== undefined) data.dateVersement = patch.dateVersement
  if (patch.mode !== undefined) data.mode = patch.mode
  if (patch.note !== undefined) data.note = patch.note

  const updated = await tx.versement.update({ where: { id }, data })

  if (patch.montant !== undefined) {
    const delta = patch.montant - existing.montant
    if (delta !== 0) {
      await tx.contribution.update({
        where: { id: existing.contributionId },
        data: {
          montantVerse: { increment: delta },
          montantValorise: { increment: delta },
        },
      })
    }
  }
  return updated
}

/**
 * Supprime le versement et décrémente la contribution du même montant. REFUSE (VersementAvecRecuError)
 * si un reçu a été émis (audit M3 : pas de reçu orphelin). Lève P2025 si le versement est introuvable.
 */
export async function appliquerSuppressionVersement(tx: any, id: string): Promise<void> {
  const existing = await tx.versement.findUnique({ where: { id } })
  if (!existing) introuvable()

  // Seul un reçu ACTIF bloque : un reçu ANNULÉ garde sa trace comptable mais libère le versement.
  const recuActif = await tx.recu.findFirst({
    where: { versementId: id, annuleLe: null },
    select: { id: true },
  })
  if (recuActif) throw new VersementAvecRecuError()

  await tx.versement.delete({ where: { id } })
  await tx.contribution.update({
    where: { id: existing.contributionId },
    data: {
      montantVerse: { decrement: existing.montant },
      montantValorise: { decrement: existing.montant },
    },
  })
}

/** Écart détecté entre le compteur dénormalisé et la somme réelle des versements d'une contribution. */
export interface EcartReconciliation {
  contributionId: string
  membreId: string
  annee: number
  /** `Contribution.montantVerse` (dénormalisé, entretenu par increment/decrement). */
  montantVerseEnregistre: number
  /** Σ des `Versement.montant` réels de la contribution. */
  sommeVersements: number
  /** `montantVerseEnregistre − sommeVersements` (0 attendu ; ≠ 0 = dérive à investiguer). */
  ecart: number
}

/**
 * RÉCONCILIATION (audit M2) — compare, pour chaque contribution de l'org courante, le compteur
 * dénormalisé `montantVerse` à la somme RÉELLE des versements (`Σ montant`). Tout écart signale une
 * dérive (écriture hors chemin nominal, delta bogué…). Sur un produit dont la promesse est la
 * transparence financière, c'est le filet de sécurité des soldes. LECTURE SEULE (ne corrige rien) —
 * scopée par le contexte tenant (l'appelant est dans l'org). NB : on cible `montantVerse` et NON
 * `montantValorise`, ce dernier pouvant légitimement diverger via un Équilibrage.
 */
export async function reconcilierVersements(prisma: any): Promise<EcartReconciliation[]> {
  const contributions = await prisma.contribution.findMany({
    select: { id: true, membreId: true, annee: true, montantVerse: true },
  })
  const sommes = await prisma.versement.groupBy({
    by: ['contributionId'],
    _sum: { montant: true },
  })
  const parContribution = new Map<string, number>(
    sommes.map((s: any) => [s.contributionId, s._sum?.montant ?? 0]),
  )

  const ecarts: EcartReconciliation[] = []
  for (const c of contributions) {
    const somme = parContribution.get(c.id) ?? 0
    if (somme !== c.montantVerse) {
      ecarts.push({
        contributionId: c.id,
        membreId: c.membreId,
        annee: c.annee,
        montantVerseEnregistre: c.montantVerse,
        sommeVersements: somme,
        ecart: c.montantVerse - somme,
      })
    }
  }
  return ecarts
}
/* eslint-enable @typescript-eslint/no-explicit-any */
