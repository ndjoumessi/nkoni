import { Prisma } from '../generated/prisma/client'
import { hashPassword } from './auth.service'
import type { Role } from '../middlewares/permissions'

/**
 * Gestion des comptes Utilisateur (§4.5) — réservé ADMIN (matrice §2 : seul ADMIN a le
 * CRUD complet ; le read/update de MEMBRE_SIMPLE concerne son PROPRE profil, hors de cette
 * surface d'administration).
 *
 * Découplé de Fastify, Prisma injecté (mockable en test). Le `passwordHash` n'est JAMAIS
 * renvoyé : toutes les lectures passent par `PUBLIC_SELECT`.
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Email déjà pris (contrainte @unique). → 409 */
export class EmailDejaUtiliseError extends Error {
  constructor(email: string) {
    super(`Un compte existe déjà avec l'email ${email}.`)
    this.name = 'EmailDejaUtiliseError'
  }
}

/** Le membre à lier n'existe pas. → 400 */
export class MembreIntrouvableError extends Error {
  constructor(membreId: string) {
    super(`Membre introuvable (${membreId}).`)
    this.name = 'MembreIntrouvableError'
  }
}

/** Le membre à lier a déjà un compte (compteUtilisateurId @unique). → 409 */
export class MembreDejaLieError extends Error {
  constructor() {
    super('Ce membre est déjà lié à un compte.')
    this.name = 'MembreDejaLieError'
  }
}

/** Le compte visé par une mise à jour n'existe pas. → 404 */
export class UtilisateurIntrouvableError extends Error {
  constructor() {
    super('Utilisateur introuvable.')
    this.name = 'UtilisateurIntrouvableError'
  }
}

/* -------------------------------------------------------------------------- */
/* Accès Prisma (surface minimale, mockable) + projection publique            */
/* -------------------------------------------------------------------------- */

/** Projection sans `passwordHash`, avec le membre lié éventuel. */
const PUBLIC_SELECT = {
  id: true,
  email: true,
  role: true,
  actif: true,
  createdAt: true,
  updatedAt: true,
  membre: { select: { id: true, nom: true, prenom: true } },
} as const

export interface UtilisateurPrisma {
  utilisateur: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(args: any): Promise<any>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste tous les comptes, triés par email, sans les hash. */
export function listerUtilisateurs(prisma: UtilisateurPrisma) {
  return prisma.utilisateur.findMany({ select: PUBLIC_SELECT, orderBy: { email: 'asc' } })
}

/** Vérifie qu'un membre existe et n'est pas déjà rattaché à un compte. */
async function verifierMembreLiable(
  prisma: UtilisateurPrisma,
  membreId: string,
): Promise<void> {
  const membre = await prisma.membre.findUnique({
    where: { id: membreId },
    select: { id: true, compteUtilisateurId: true },
  })
  if (!membre) throw new MembreIntrouvableError(membreId)
  if (membre.compteUtilisateurId) throw new MembreDejaLieError()
}

/* -------------------------------------------------------------------------- */
/* Création                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreerUtilisateurParams {
  email: string
  password: string
  role: Role
  /** Optionnel : rattache le compte à une fiche Membre existante (§4.5). */
  membreId?: string
}

export async function creerUtilisateur(
  prisma: UtilisateurPrisma,
  { email, password, role, membreId }: CreerUtilisateurParams,
) {
  // Pré-validation du lien membre (message clair plutôt qu'un P2002/P2025 brut).
  if (membreId !== undefined) await verifierMembreLiable(prisma, membreId)

  const passwordHash = await hashPassword(password)
  const data: Prisma.UtilisateurUncheckedCreateInput & {
    membre?: { connect: { id: string } }
  } = { email, passwordHash, role }
  if (membreId !== undefined) data.membre = { connect: { id: membreId } }

  try {
    return await prisma.utilisateur.create({ data, select: PUBLIC_SELECT })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new EmailDejaUtiliseError(email)
    }
    throw err
  }
}

/* -------------------------------------------------------------------------- */
/* Mise à jour (rôle / activation)                                            */
/* -------------------------------------------------------------------------- */

export interface MajUtilisateurParams {
  role?: Role
  /** Désactivation douce (pas de suppression dure) : actif=false. */
  actif?: boolean
}

export async function majUtilisateur(
  prisma: UtilisateurPrisma,
  id: string,
  { role, actif }: MajUtilisateurParams,
) {
  const data: Prisma.UtilisateurUncheckedUpdateInput = {}
  if (role !== undefined) data.role = role
  if (actif !== undefined) data.actif = actif

  try {
    return await prisma.utilisateur.update({ where: { id }, data, select: PUBLIC_SELECT })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new UtilisateurIntrouvableError()
    }
    throw err
  }
}
