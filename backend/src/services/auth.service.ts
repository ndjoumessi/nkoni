import argon2 from 'argon2'
import type { Role } from '../middlewares/permissions'

/**
 * Logique d'authentification, découplée de Fastify et testable avec un Prisma mocké.
 * (La signature des JWT reste dans la route, qui a accès aux instances @fastify/jwt.)
 */

export interface AuthenticatedUser {
  id: string
  email: string
  role: Role
  membreId: string | null
  /** Organisation d'appartenance (SaaS §2). Null pour un futur Super-Admin transverse (§2.3). */
  organisationId: string | null
  actif: boolean
}

/**
 * Surface minimale de Prisma utilisée ici — permet d'injecter un mock dans les tests
 * sans dépendre du vrai PrismaClient / d'une base de données.
 *
 * `findUnique` est déclaré en forme de méthode avec `any` pour rester structurellement
 * compatible à la fois avec le vrai `PrismaClient` (signature générique complexe) et
 * avec un mock simple `async () => record`.
 */
export interface AuthPrisma {
  utilisateur: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(args: any): Promise<any>
  }
}

/**
 * L'ancien mot de passe fourni lors d'un changement self-service ne correspond pas.
 * Mappée en 401 par la route (on ne confirme rien sur le compte). → 401
 */
export class AncienMotDePasseIncorrectError extends Error {
  constructor() {
    super('Ancien mot de passe incorrect.')
    this.name = 'AncienMotDePasseIncorrectError'
  }
}

/** Hash argon2 d'un mot de passe en clair (utilisé au seed / à la création de compte). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain)
}

function toAuthUser(record: Record<string, unknown>): AuthenticatedUser {
  const membre = record['membre'] as { id: string } | null | undefined
  return {
    id: record['id'] as string,
    email: record['email'] as string,
    role: record['role'] as Role,
    membreId: membre?.id ?? null,
    organisationId: (record['organisationId'] as string | null | undefined) ?? null,
    actif: record['actif'] as boolean,
  }
}

/**
 * Vérifie un couple (email, mot de passe).
 * Retourne l'utilisateur si les identifiants sont valides, sinon `null`.
 *
 * Anti-énumération : on ne distingue pas « email inconnu » de « mauvais mot de passe »
 * — les deux renvoient `null`. Le contrôle `actif` est laissé à l'appelant (la route
 * répond 403 pour un compte désactivé, ce qui nécessite de connaître le user).
 */
export async function verifyCredentials(
  prisma: AuthPrisma,
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const record = await prisma.utilisateur.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      actif: true,
      organisationId: true,
      passwordHash: true,
      membre: { select: { id: true } },
    },
  })
  if (!record) return null

  const passwordHash = record['passwordHash'] as string
  const valide = await argon2.verify(passwordHash, password)
  if (!valide) return null

  return toAuthUser(record)
}

/**
 * Change le mot de passe d'un compte APRÈS vérification de l'ancien (changement
 * self-service : l'utilisateur connecté change son propre mot de passe).
 *
 * Lève `AncienMotDePasseIncorrectError` (→ 401) si le compte est introuvable OU si
 * l'ancien mot de passe ne correspond pas — on ne distingue pas les deux cas.
 */
export async function changerMotDePasse(
  prisma: AuthPrisma,
  userId: string,
  ancienMotDePasse: string,
  nouveauMotDePasse: string,
): Promise<void> {
  const record = await prisma.utilisateur.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
  if (!record) throw new AncienMotDePasseIncorrectError()

  const passwordHash = record['passwordHash'] as string
  const valide = await argon2.verify(passwordHash, ancienMotDePasse)
  if (!valide) throw new AncienMotDePasseIncorrectError()

  const nouveauHash = await hashPassword(nouveauMotDePasse)
  await prisma.utilisateur.update({ where: { id: userId }, data: { passwordHash: nouveauHash } })
}

/** Recharge un utilisateur par id (pour /auth/refresh et /auth/me). */
export async function findUserById(
  prisma: AuthPrisma,
  id: string,
): Promise<AuthenticatedUser | null> {
  const record = await prisma.utilisateur.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      actif: true,
      organisationId: true,
      membre: { select: { id: true } },
    },
  })
  if (!record) return null
  return toAuthUser(record)
}
