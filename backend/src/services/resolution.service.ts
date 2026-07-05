import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'

/**
 * V1.1 (§5) — Résolutions.
 *
 * CHOIX ARBITRÉ (pas un oubli) : les résolutions sont PUREMENT DOCUMENTAIRES. Adopter,
 * rejeter ou reporter une résolution n'a AUCUN effet mécanique sur le reste du système —
 * aucune création/modification automatique de Membre, Contribution, Barème, Versement,
 * etc. Ce n'est qu'un texte archivé, rattaché à une réunion (et optionnellement à un point
 * d'ordre du jour), consultable. Une future itération qui voudrait des effets (ex. « une
 * résolution adoptée ouvre l'année de contribution ») devra les ajouter EXPLICITEMENT ici.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test).
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Résolution introuvable. → 404 */
export class ResolutionIntrouvableError extends Error {
  constructor() {
    super('Résolution introuvable.')
    this.name = 'ResolutionIntrouvableError'
  }
}

/** Réunion cible introuvable. → 404 */
export class ReunionIntrouvableError extends Error {
  constructor() {
    super('Réunion introuvable.')
    this.name = 'ReunionIntrouvableError'
  }
}

/** Point d'ordre du jour référencé introuvable. → 404 */
export class PointIntrouvableError extends Error {
  constructor() {
    super("Point d'ordre du jour introuvable.")
    this.name = 'PointIntrouvableError'
  }
}

/**
 * Le point d'ordre du jour référencé appartient à une AUTRE réunion que la résolution.
 * Incohérence structurelle → refus. → 400
 */
export class PointHorsReunionError extends Error {
  constructor() {
    super("Le point d'ordre du jour n'appartient pas à cette réunion.")
    this.name = 'PointHorsReunionError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (minimale, mockable)                                        */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ResolutionPrisma {
  resolution: {
    findMany(args: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
  reunion: {
    findUnique(args: any): Promise<any>
  }
  pointOrdreDuJour: {
    findUnique(args: any): Promise<any>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type StatutResolution = 'ADOPTEE' | 'REJETEE' | 'REPORTEE'

/* -------------------------------------------------------------------------- */
/* Helpers de validation                                                      */
/* -------------------------------------------------------------------------- */

/** Vérifie que la réunion existe. */
async function verifierReunion(prisma: ResolutionPrisma, reunionId: string): Promise<void> {
  const reunion = await prisma.reunion.findUnique({
    where: { id: reunionId },
    select: { id: true },
  })
  if (!reunion) throw new ReunionIntrouvableError()
}

/**
 * Vérifie que le point existe ET appartient bien à `reunionId`.
 * Lève PointIntrouvableError (404) ou PointHorsReunionError (400).
 */
async function verifierPointDansReunion(
  prisma: ResolutionPrisma,
  pointId: string,
  reunionId: string,
): Promise<void> {
  const point = await prisma.pointOrdreDuJour.findUnique({
    where: { id: pointId },
    select: { id: true, reunionId: true },
  })
  if (!point) throw new PointIntrouvableError()
  if (point.reunionId !== reunionId) throw new PointHorsReunionError()
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/** Liste les résolutions d'une réunion (ordre de création). */
export function listerResolutions(prisma: ResolutionPrisma, reunionId: string) {
  return prisma.resolution.findMany({
    where: { reunionId },
    orderBy: { createdAt: 'asc' },
  })
}

/* -------------------------------------------------------------------------- */
/* Création                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreerResolutionParams {
  texte: string
  statut?: StatutResolution
  dateVote?: string | Date
  /** Rattachement optionnel à un point d'ordre du jour de la MÊME réunion. */
  pointOrdreDuJourId?: string
}

export async function creerResolution(
  prisma: ResolutionPrisma,
  reunionId: string,
  params: CreerResolutionParams,
) {
  await verifierReunion(prisma, reunionId)
  if (params.pointOrdreDuJourId !== undefined) {
    await verifierPointDansReunion(prisma, params.pointOrdreDuJourId, reunionId)
  }

  const data: CreationScopee<Prisma.ResolutionUncheckedCreateInput> = {
    reunionId,
    texte: params.texte,
    ...(params.statut !== undefined ? { statut: params.statut } : {}),
    ...(params.dateVote !== undefined ? { dateVote: new Date(params.dateVote) } : {}),
    ...(params.pointOrdreDuJourId !== undefined
      ? { pointOrdreDuJourId: params.pointOrdreDuJourId }
      : {}),
  }
  return prisma.resolution.create({ data })
}

/* -------------------------------------------------------------------------- */
/* Mise à jour / suppression                                                  */
/* -------------------------------------------------------------------------- */

export interface MajResolutionParams {
  texte?: string
  statut?: StatutResolution
  dateVote?: string | Date | null
  /** null = détacher le point ; un id = rattacher (validé sur la réunion de la résolution). */
  pointOrdreDuJourId?: string | null
}

export async function majResolution(
  prisma: ResolutionPrisma,
  id: string,
  params: MajResolutionParams,
) {
  const existante = await prisma.resolution.findUnique({
    where: { id },
    select: { id: true, reunionId: true },
  })
  if (!existante) throw new ResolutionIntrouvableError()

  // Rattachement à un point : il doit appartenir à la réunion de la résolution.
  if (params.pointOrdreDuJourId !== undefined && params.pointOrdreDuJourId !== null) {
    await verifierPointDansReunion(prisma, params.pointOrdreDuJourId, existante.reunionId)
  }

  const data: Prisma.ResolutionUncheckedUpdateInput = {}
  if (params.texte !== undefined) data.texte = params.texte
  if (params.statut !== undefined) data.statut = params.statut
  if (params.dateVote !== undefined) {
    data.dateVote = params.dateVote === null ? null : new Date(params.dateVote)
  }
  if (params.pointOrdreDuJourId !== undefined) {
    data.pointOrdreDuJourId = params.pointOrdreDuJourId
  }

  return prisma.resolution.update({ where: { id }, data })
}

export async function supprimerResolution(prisma: ResolutionPrisma, id: string): Promise<void> {
  try {
    await prisma.resolution.delete({ where: { id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new ResolutionIntrouvableError()
    }
    throw err
  }
}
