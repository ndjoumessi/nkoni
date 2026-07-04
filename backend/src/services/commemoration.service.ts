import { Prisma } from '../generated/prisma/client'

/**
 * V2 — Commémorations / cérémonies (domaine du GUIDE_RELIGIEUX + ADMIN).
 *
 * CRUD simple (pas de règle métier complexe), à l'image de reunion.service mais sans
 * sous-ressource. Une commémoration peut concerner 0..n membres (défunts honorés) via
 * une relation many-to-many. Prisma injecté (mockable en test).
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Commémoration introuvable. → 404 */
export class CommemorationIntrouvableError extends Error {
  constructor() {
    super('Commémoration introuvable.')
    this.name = 'CommemorationIntrouvableError'
  }
}

/** Un id de membre concerné ne référence aucun membre. → 400 */
export class MembreConcerneIntrouvableError extends Error {
  constructor() {
    super('Un membre concerné est introuvable.')
    this.name = 'MembreConcerneIntrouvableError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (minimale, mockable)                                        */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CommemorationPrisma {
  commemoration: {
    findMany(args?: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
  membre: { findMany(args: any): Promise<any[]> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type TypeCommemoration = 'COMMEMORATION' | 'CEREMONIE'
type StatutCommemoration = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'

const COMMEMORATION_INCLUDE = {
  membresConcernes: { select: { id: true, nom: true, prenom: true } },
} as const

/** Vérifie que tous les ids de membres existent, sinon lève une erreur métier (400). */
async function validerMembres(prisma: CommemorationPrisma, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const trouves = await prisma.membre.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  if (trouves.length !== new Set(ids).size) throw new MembreConcerneIntrouvableError()
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/** Liste les commémorations, plus récentes (par date) d'abord. */
export function listerCommemorations(prisma: CommemorationPrisma) {
  return prisma.commemoration.findMany({
    orderBy: { date: 'desc' },
    include: COMMEMORATION_INCLUDE,
  })
}

/** Détail d'une commémoration. Lève 404 si absente. */
export async function getCommemoration(prisma: CommemorationPrisma, id: string) {
  const commemoration = await prisma.commemoration.findUnique({
    where: { id },
    include: COMMEMORATION_INCLUDE,
  })
  if (!commemoration) throw new CommemorationIntrouvableError()
  return commemoration
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreerCommemorationParams {
  titre: string
  type?: TypeCommemoration
  date: string | Date
  lieu?: string
  description?: string
  statut?: StatutCommemoration
  notes?: string
  membresConcernes?: string[]
}

export async function creerCommemoration(
  prisma: CommemorationPrisma,
  params: CreerCommemorationParams,
) {
  const membreIds = params.membresConcernes ?? []
  await validerMembres(prisma, membreIds)

  const data: Prisma.CommemorationCreateInput = {
    titre: params.titre,
    date: new Date(params.date),
    ...(params.type !== undefined ? { type: params.type } : {}),
    ...(params.lieu !== undefined ? { lieu: params.lieu } : {}),
    ...(params.description !== undefined ? { description: params.description } : {}),
    ...(params.statut !== undefined ? { statut: params.statut } : {}),
    ...(params.notes !== undefined ? { notes: params.notes } : {}),
    ...(membreIds.length > 0
      ? { membresConcernes: { connect: membreIds.map((id) => ({ id })) } }
      : {}),
  }
  return prisma.commemoration.create({ data, include: COMMEMORATION_INCLUDE })
}

export interface MajCommemorationParams {
  titre?: string
  type?: TypeCommemoration
  date?: string | Date
  lieu?: string | null
  description?: string | null
  statut?: StatutCommemoration
  notes?: string | null
  /** Si fourni, REMPLACE l'ensemble des membres concernés (set). */
  membresConcernes?: string[]
}

export async function majCommemoration(
  prisma: CommemorationPrisma,
  id: string,
  params: MajCommemorationParams,
) {
  if (params.membresConcernes !== undefined) {
    await validerMembres(prisma, params.membresConcernes)
  }

  const data: Prisma.CommemorationUpdateInput = {}
  if (params.titre !== undefined) data.titre = params.titre
  if (params.type !== undefined) data.type = params.type
  if (params.date !== undefined) data.date = new Date(params.date)
  if (params.lieu !== undefined) data.lieu = params.lieu
  if (params.description !== undefined) data.description = params.description
  if (params.statut !== undefined) data.statut = params.statut
  if (params.notes !== undefined) data.notes = params.notes
  if (params.membresConcernes !== undefined) {
    // `set` remplace intégralement la liste des membres concernés.
    data.membresConcernes = { set: params.membresConcernes.map((mid) => ({ id: mid })) }
  }

  try {
    return await prisma.commemoration.update({
      where: { id },
      data,
      include: COMMEMORATION_INCLUDE,
    })
  } catch (err) {
    throw mapP2025(err)
  }
}

/** Supprime une commémoration. Lève 404 si absente. */
export async function supprimerCommemoration(
  prisma: CommemorationPrisma,
  id: string,
): Promise<void> {
  try {
    await prisma.commemoration.delete({ where: { id } })
  } catch (err) {
    throw mapP2025(err)
  }
}

/** P2025 (cible absente) → 404 métier ; relance le reste. */
function mapP2025(err: unknown): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new CommemorationIntrouvableError()
  }
  return err instanceof Error ? err : new Error(String(err))
}
