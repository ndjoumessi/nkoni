import argon2 from 'argon2'
import type { Role } from '../middlewares/permissions'
import type { Langue, Devise } from '../lib/i18n'

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
  /** Préférence de langue PERSO (§4). Null = non exprimée → on hérite du défaut de l'org. */
  langue: Langue | null
  /** Langue par défaut de l'organisation (§4). Null pour le SUPER_ADMIN (sans org). */
  organisationLangueDefaut: Langue | null
  /** Devise de l'organisation (§5, immuable). Null pour le SUPER_ADMIN (sans org). */
  devise: Devise | null
  /** Nom de l'organisation d'appartenance — affiché en tête d'interface. Null pour le SUPER_ADMIN. */
  nomOrganisation: string | null
}

/**
 * Langue EFFECTIVE d'un utilisateur (§4) : sa préférence perso si exprimée, sinon le défaut de
 * son organisation (cohérent avec le choix fait à l'inscription). Null seulement pour un compte
 * sans préférence ET sans org (SUPER_ADMIN) → l'i18n retombera alors sur Accept-Language/FR.
 */
export function langueEffective(user: AuthenticatedUser): Langue | null {
  return user.langue ?? user.organisationLangueDefaut
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
  const organisation = record['organisation'] as
    | { langueDefaut?: Langue; devise?: Devise; nom?: string }
    | null
    | undefined
  return {
    id: record['id'] as string,
    email: record['email'] as string,
    role: record['role'] as Role,
    membreId: membre?.id ?? null,
    organisationId: (record['organisationId'] as string | null | undefined) ?? null,
    actif: record['actif'] as boolean,
    langue: (record['langue'] as Langue | null | undefined) ?? null,
    organisationLangueDefaut: organisation?.langueDefaut ?? null,
    devise: organisation?.devise ?? null,
    nomOrganisation: organisation?.nom ?? null,
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
      langue: true,
      passwordHash: true,
      membre: { select: { id: true } },
      // §4 : défaut de langue de l'org → langue effective si l'utilisateur n'a pas de préférence.
      // §5 : devise de l'org → formatage locale-aware des montants côté front (F6).
      organisation: { select: { langueDefaut: true, devise: true, nom: true } },
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
      langue: true,
      membre: { select: { id: true } },
      organisation: { select: { langueDefaut: true, devise: true, nom: true } },
    },
  })
  if (!record) return null
  return toAuthUser(record)
}

/**
 * Fixe la préférence de langue perso (§4) du compte et renvoie l'utilisateur rechargé
 * (pour ré-émettre un access token portant la nouvelle langue). Keyé sur l'id du compte
 * authentifié → appelé en `runUnscoped` par la route (sûr, y compris pour un SUPER_ADMIN).
 */
export async function definirLangue(
  prisma: AuthPrisma,
  userId: string,
  langue: Langue,
): Promise<AuthenticatedUser | null> {
  await prisma.utilisateur.update({ where: { id: userId }, data: { langue } })
  return findUserById(prisma, userId)
}
