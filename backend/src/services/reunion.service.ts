import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'

/**
 * V1.1 (§5) — Réunions + Ordre du jour.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test), à l'image des services MVP.
 * Une réunion peut être créée AVEC ses points d'ordre du jour en une fois ; on peut aussi
 * en ajouter, les modifier, les réordonner ou les supprimer après coup.
 *
 * NB : les résolutions (documentaires) sont gérées dans resolution.service.ts.
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Réunion introuvable. → 404 */
export class ReunionIntrouvableError extends Error {
  constructor() {
    super('Réunion introuvable.')
    this.name = 'ReunionIntrouvableError'
  }
}

/** Point d'ordre du jour introuvable. → 404 */
export class PointIntrouvableError extends Error {
  constructor() {
    super("Point d'ordre du jour introuvable.")
    this.name = 'PointIntrouvableError'
  }
}

/**
 * Réordonnancement invalide : la liste d'ids fournie n'est pas exactement l'ensemble des
 * points de la réunion (id étranger, doublon ou point manquant). → 400
 */
export class ReordonnancementInvalideError extends Error {
  constructor() {
    super("La liste de réordonnancement doit contenir exactement les points de la réunion.")
    this.name = 'ReordonnancementInvalideError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (minimale, mockable)                                        */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReunionPrisma {
  reunion: {
    findMany(args?: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
  pointOrdreDuJour: {
    create(args: any): Promise<any>
    createMany(args: any): Promise<any>
    update(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
  // Prisma expose les deux formes ; on utilise la forme tableau (réordonnancement) et la
  // forme interactive (création réunion + points scopés en une transaction).
  $transaction(ops: Promise<any>[]): Promise<any[]>
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type TypeReunion = 'ORDINAIRE' | 'EXTRAORDINAIRE'
type StatutReunion = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'

/** Point inclus, ordonné par `ordre` croissant ; résolutions incluses (les plus récentes). */
const REUNION_INCLUDE = {
  pointsOrdreDuJour: { orderBy: { ordre: 'asc' } },
  resolutions: { orderBy: { createdAt: 'asc' } },
} as const

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/** Liste les réunions (les plus récentes d'abord), avec un décompte léger. */
export function listerReunions(prisma: ReunionPrisma) {
  return prisma.reunion.findMany({
    orderBy: { date: 'desc' },
    include: {
      _count: { select: { pointsOrdreDuJour: true, resolutions: true } },
    },
  })
}

/** Détail d'une réunion (points ordonnés + résolutions). Lève 404 si absente. */
export async function getReunion(prisma: ReunionPrisma, id: string) {
  const reunion = await prisma.reunion.findUnique({
    where: { id },
    include: REUNION_INCLUDE,
  })
  if (!reunion) throw new ReunionIntrouvableError()
  return reunion
}

/* -------------------------------------------------------------------------- */
/* Création (réunion + points imbriqués optionnels)                           */
/* -------------------------------------------------------------------------- */

export interface PointInput {
  titre: string
  notes?: string
}

export interface CreerReunionParams {
  date: string | Date
  lieu: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string
  /** Points d'ordre du jour créés en même temps ; `ordre` auto-assigné par position. */
  pointsOrdreDuJour?: PointInput[]
}

export async function creerReunion(prisma: ReunionPrisma, params: CreerReunionParams) {
  const data: CreationScopee<Prisma.ReunionUncheckedCreateInput> = {
    date: new Date(params.date),
    lieu: params.lieu,
    ...(params.type !== undefined ? { type: params.type } : {}),
    ...(params.statut !== undefined ? { statut: params.statut } : {}),
    ...(params.compteRenduTexte !== undefined
      ? { compteRenduTexte: params.compteRenduTexte }
      : {}),
  }
  const points = params.pointsOrdreDuJour ?? []

  // Atomique : la réunion ET ses points. Les points sont un modèle SCOPÉ → écrits via une op
  // TOP-LEVEL (createMany) pour que l'extension leur injecte organisationId (un nested create
  // ne serait pas ré-scopé → organisationId nul, interdit depuis la Phase B NOT NULL).
  return prisma.$transaction(async (tx) => {
    const reunion = await tx.reunion.create({ data })
    if (points.length > 0) {
      await tx.pointOrdreDuJour.createMany({
        data: points.map((p, index) => ({
          reunionId: reunion.id,
          titre: p.titre,
          ordre: index,
          ...(p.notes !== undefined ? { notes: p.notes } : {}),
        })),
      })
    }
    return tx.reunion.findUnique({ where: { id: reunion.id }, include: REUNION_INCLUDE })
  })
}

/* -------------------------------------------------------------------------- */
/* Mise à jour / suppression de la réunion                                    */
/* -------------------------------------------------------------------------- */

export interface MajReunionParams {
  date?: string | Date
  lieu?: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string | null
}

export async function majReunion(
  prisma: ReunionPrisma,
  id: string,
  params: MajReunionParams,
) {
  const data: Prisma.ReunionUncheckedUpdateInput = {}
  if (params.date !== undefined) data.date = new Date(params.date)
  if (params.lieu !== undefined) data.lieu = params.lieu
  if (params.type !== undefined) data.type = params.type
  if (params.statut !== undefined) data.statut = params.statut
  if (params.compteRenduTexte !== undefined) data.compteRenduTexte = params.compteRenduTexte

  try {
    return await prisma.reunion.update({ where: { id }, data, include: REUNION_INCLUDE })
  } catch (err) {
    throw mapP2025(err, new ReunionIntrouvableError())
  }
}

/** Supprime une réunion (cascade DB : ses points ; ses résolutions). Lève 404 si absente. */
export async function supprimerReunion(prisma: ReunionPrisma, id: string): Promise<void> {
  try {
    await prisma.reunion.delete({ where: { id } })
  } catch (err) {
    throw mapP2025(err, new ReunionIntrouvableError())
  }
}

/* -------------------------------------------------------------------------- */
/* Points d'ordre du jour (ajout / modif / suppression / réordonnancement)    */
/* -------------------------------------------------------------------------- */

/** Ajoute un point en fin d'ordre du jour (ordre = nb de points existants). */
export async function ajouterPoint(
  prisma: ReunionPrisma,
  reunionId: string,
  point: PointInput,
) {
  // Charge la réunion + ses points pour calculer la position suivante ET valider l'existence.
  const reunion = await prisma.reunion.findUnique({
    where: { id: reunionId },
    include: { pointsOrdreDuJour: { select: { id: true } } },
  })
  if (!reunion) throw new ReunionIntrouvableError()

  const ordre = reunion.pointsOrdreDuJour.length
  return prisma.pointOrdreDuJour.create({
    data: {
      reunionId,
      titre: point.titre,
      ordre,
      ...(point.notes !== undefined ? { notes: point.notes } : {}),
    },
  })
}

export interface MajPointParams {
  titre?: string
  notes?: string | null
}

export async function majPoint(prisma: ReunionPrisma, pointId: string, params: MajPointParams) {
  const data: Prisma.PointOrdreDuJourUncheckedUpdateInput = {}
  if (params.titre !== undefined) data.titre = params.titre
  if (params.notes !== undefined) data.notes = params.notes
  try {
    return await prisma.pointOrdreDuJour.update({ where: { id: pointId }, data })
  } catch (err) {
    throw mapP2025(err, new PointIntrouvableError())
  }
}

export async function supprimerPoint(prisma: ReunionPrisma, pointId: string): Promise<void> {
  try {
    await prisma.pointOrdreDuJour.delete({ where: { id: pointId } })
  } catch (err) {
    throw mapP2025(err, new PointIntrouvableError())
  }
}

/**
 * Réordonne les points d'une réunion. `ordreIds` DOIT être une permutation exacte de
 * l'ensemble des points de la réunion (mêmes ids, sans doublon ni manquant), sinon rejet.
 * L'ordre final suit la position dans `ordreIds`. Appliqué en transaction (atomique).
 */
export async function reordonnerPoints(
  prisma: ReunionPrisma,
  reunionId: string,
  ordreIds: string[],
) {
  const reunion = await prisma.reunion.findUnique({
    where: { id: reunionId },
    include: { pointsOrdreDuJour: { select: { id: true } } },
  })
  if (!reunion) throw new ReunionIntrouvableError()

  const idsReunion: string[] = reunion.pointsOrdreDuJour.map((p: { id: string }) => p.id)
  const setReunion = new Set(idsReunion)
  const setFournis = new Set(ordreIds)

  // Permutation exacte : même cardinalité (pas de doublon) et mêmes membres.
  const permutationValide =
    ordreIds.length === idsReunion.length &&
    setFournis.size === ordreIds.length &&
    ordreIds.every((id) => setReunion.has(id))
  if (!permutationValide) throw new ReordonnancementInvalideError()

  await prisma.$transaction(
    ordreIds.map((id, index) =>
      prisma.pointOrdreDuJour.update({ where: { id }, data: { ordre: index } }),
    ),
  )
  return getReunion(prisma, reunionId)
}

/* -------------------------------------------------------------------------- */
/* Utilitaire                                                                  */
/* -------------------------------------------------------------------------- */

/** Traduit un P2025 (record cible absent) en erreur métier fournie ; relance le reste. */
function mapP2025(err: unknown, metier: Error): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return metier
  }
  return err instanceof Error ? err : new Error(String(err))
}
