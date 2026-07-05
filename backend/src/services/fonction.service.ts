import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'

/**
 * V1.1 (§5) — Fonctions/organes familiaux (CRUD).
 *
 * Découplé de Fastify, Prisma injecté (mockable en test), à l'image des services MVP.
 * L'historique des nominations (AffectationFonction) est géré dans affectation.service.ts ;
 * ici on ne manipule que la définition des fonctions (nom unique + description).
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Fonction introuvable. → 404 */
export class FonctionIntrouvableError extends Error {
  constructor() {
    super('Fonction introuvable.')
    this.name = 'FonctionIntrouvableError'
  }
}

/** Nom de fonction déjà utilisé (contrainte d'unicité). → 409 */
export class FonctionNomDuplicateError extends Error {
  constructor() {
    super('Une fonction porte déjà ce nom.')
    this.name = 'FonctionNomDuplicateError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (minimale, mockable)                                        */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FonctionPrisma {
  fonctionFamiliale: {
    findMany(args?: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Champs de membre exposés avec une affectation (titulaire). */
const MEMBRE_SELECT = { id: true, nom: true, prenom: true } as const

/**
 * Liste : chaque fonction avec son titulaire ACTUEL (affectation dateFin=null, 0 ou 1
 * par invariant mono-titulaire) et le nombre total d'affectations (taille de l'historique).
 */
export function listerFonctions(prisma: FonctionPrisma) {
  return prisma.fonctionFamiliale.findMany({
    orderBy: { nom: 'asc' },
    include: {
      affectations: {
        where: { dateFin: null },
        include: { membre: { select: MEMBRE_SELECT } },
      },
      _count: { select: { affectations: true } },
    },
  })
}

/** Détail d'une fonction + son historique complet (affectations, plus récentes d'abord). */
export async function getFonction(prisma: FonctionPrisma, id: string) {
  const fonction = await prisma.fonctionFamiliale.findUnique({
    where: { id },
    include: {
      affectations: {
        orderBy: { dateDebut: 'desc' },
        include: { membre: { select: MEMBRE_SELECT } },
      },
    },
  })
  if (!fonction) throw new FonctionIntrouvableError()
  return fonction
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreerFonctionParams {
  nom: string
  description?: string
}

export async function creerFonction(prisma: FonctionPrisma, params: CreerFonctionParams) {
  const data: CreationScopee<Prisma.FonctionFamilialeUncheckedCreateInput> = {
    nom: params.nom,
    ...(params.description !== undefined ? { description: params.description } : {}),
  }
  try {
    return await prisma.fonctionFamiliale.create({ data })
  } catch (err) {
    throw mapNomDuplicate(err)
  }
}

export interface MajFonctionParams {
  nom?: string
  description?: string | null
}

export async function majFonction(
  prisma: FonctionPrisma,
  id: string,
  params: MajFonctionParams,
) {
  const data: Prisma.FonctionFamilialeUncheckedUpdateInput = {}
  if (params.nom !== undefined) data.nom = params.nom
  if (params.description !== undefined) data.description = params.description
  try {
    return await prisma.fonctionFamiliale.update({ where: { id }, data })
  } catch (err) {
    throw mapFonctionError(err)
  }
}

/** Supprime une fonction (cascade DB sur son historique d'affectations). 404 si absente. */
export async function supprimerFonction(prisma: FonctionPrisma, id: string): Promise<void> {
  try {
    await prisma.fonctionFamiliale.delete({ where: { id } })
  } catch (err) {
    throw mapFonctionError(err)
  }
}

/* -------------------------------------------------------------------------- */
/* Utilitaires de mapping d'erreur Prisma                                     */
/* -------------------------------------------------------------------------- */

/** P2002 (unicité `nom`) → FonctionNomDuplicateError ; relance le reste. */
function mapNomDuplicate(err: unknown): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new FonctionNomDuplicateError()
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** P2025 → 404, P2002 → 409 ; relance le reste. */
function mapFonctionError(err: unknown): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new FonctionIntrouvableError()
    if (err.code === 'P2002') return new FonctionNomDuplicateError()
  }
  return err instanceof Error ? err : new Error(String(err))
}
