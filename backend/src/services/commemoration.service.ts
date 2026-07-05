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
  // Join explicite : liens écrits via des opérations TOP-LEVEL scopées (createMany/deleteMany).
  commemorationMembreConcerne: {
    createMany(args: any): Promise<any>
    deleteMany(args: any): Promise<any>
  }
  membre: { findMany(args: any): Promise<any[]> }
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type TypeCommemoration = 'COMMEMORATION' | 'CEREMONIE'
type StatutCommemoration = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'

const COMMEMORATION_INCLUDE = {
  membresConcernes: { select: { membre: { select: { id: true, nom: true, prenom: true } } } },
} as const

/**
 * Aplati les lignes de jointure `membresConcernes` ([{ membre }]) en `[{id,nom,prenom}]` pour
 * préserver la forme de réponse historique de l'API (le join explicite est un détail DB).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projeter(commemoration: any): any {
  if (!commemoration) return commemoration
  return {
    ...commemoration,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membresConcernes: (commemoration.membresConcernes ?? []).map((j: any) => j.membre),
  }
}

/** Vérifie que tous les ids de membres existent, sinon lève une erreur métier (400). */
async function validerMembres(prisma: CommemorationPrisma, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const trouves = await prisma.membre.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  if (trouves.length !== new Set(ids).size) throw new MembreConcerneIntrouvableError()
}

/**
 * Liste légère des membres sélectionnables comme « concernés/honorés » (id + nom +
 * prénom uniquement). Sert à peupler le formulaire — réservé aux gestionnaires (cf.
 * route : requirePermission Commemoration `create`), car GUIDE_RELIGIEUX n'a pas de
 * droit de lecture sur l'entité Membre (hors de son périmètre).
 */
export function listerMembresSelectionnables(prisma: CommemorationPrisma) {
  return prisma.membre.findMany({
    select: { id: true, nom: true, prenom: true },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  })
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/** Liste les commémorations, plus récentes (par date) d'abord. */
export async function listerCommemorations(prisma: CommemorationPrisma) {
  const list = await prisma.commemoration.findMany({
    orderBy: { date: 'desc' },
    include: COMMEMORATION_INCLUDE,
  })
  return list.map(projeter)
}

/** Détail d'une commémoration. Lève 404 si absente. */
export async function getCommemoration(prisma: CommemorationPrisma, id: string) {
  const commemoration = await prisma.commemoration.findUnique({
    where: { id },
    include: COMMEMORATION_INCLUDE,
  })
  if (!commemoration) throw new CommemorationIntrouvableError()
  return projeter(commemoration)
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
  }

  // Atomique : la commémoration ET ses liens membres. Liens via createMany top-level (scopé).
  const commemoration = await prisma.$transaction(async (tx) => {
    const cree = await tx.commemoration.create({ data })
    if (membreIds.length > 0) {
      await tx.commemorationMembreConcerne.createMany({
        data: membreIds.map((mid) => ({ commemorationId: cree.id, membreId: mid })),
      })
    }
    return tx.commemoration.findUnique({ where: { id: cree.id }, include: COMMEMORATION_INCLUDE })
  })
  return projeter(commemoration)
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

  try {
    const maj = await prisma.$transaction(async (tx) => {
      // L'update (même data vide) vérifie l'existence (P2025 si absente) et bump `updatedAt`.
      await tx.commemoration.update({ where: { id }, data })
      if (params.membresConcernes !== undefined) {
        // Remplacement intégral des liens : on efface ceux de cette commémoration (scopé)
        // puis on recrée. Opérations top-level → `organisationId` géré par l'extension.
        await tx.commemorationMembreConcerne.deleteMany({ where: { commemorationId: id } })
        if (params.membresConcernes.length > 0) {
          await tx.commemorationMembreConcerne.createMany({
            data: params.membresConcernes.map((mid) => ({ commemorationId: id, membreId: mid })),
          })
        }
      }
      return tx.commemoration.findUnique({ where: { id }, include: COMMEMORATION_INCLUDE })
    })
    return projeter(maj)
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
