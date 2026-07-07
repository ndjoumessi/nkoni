import { hashPassword } from './auth.service'
import type { AuthenticatedUser } from './auth.service'

/**
 * Auto-inscription (§3.1) — création d'une nouvelle organisation et de son premier
 * utilisateur ADMIN (le « fondateur »), de façon ATOMIQUE.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test). L'appelant DOIT exécuter ceci
 * HORS contexte d'organisation (`orgContext.runUnscoped`) : l'email est globalement unique
 * et l'organisation n'existe pas encore ; l'`organisationId` de l'admin est fourni
 * EXPLICITEMENT dans la transaction (pas d'injection par l'extension d'isolation).
 */

type Devise = 'FCFA' | 'EUR' | 'USD' | 'CAD'
type Langue = 'FR' | 'EN'

/** Email déjà utilisé. → 409, message GÉNÉRIQUE (anti-énumération : on ne révèle pas
 *  qu'un compte existe déjà, ici ou dans une autre organisation). */
export class EmailDejaUtiliseError extends Error {
  constructor() {
    super("Impossible de créer cet espace avec ces informations.")
    this.name = 'EmailDejaUtiliseError'
  }
}

export interface InscriptionParams {
  nomOrganisation: string
  devise: Devise
  langue: Langue
  email: string
  password: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface InscriptionPrisma {
  utilisateur: { findUnique(args: any): Promise<any> }
  organisation: { create(args: any): Promise<any> }
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Crée l'organisation + son admin fondateur. Devise et langue sont fixées ici et
 * IMMUABLES ensuite (§5). Retourne l'utilisateur ADMIN prêt à ouvrir une session.
 */
export async function inscrireOrganisation(
  prisma: InscriptionPrisma,
  params: InscriptionParams,
): Promise<AuthenticatedUser> {
  // Email stocké verbatim (comme /auth/login qui recherche l'email tel quel) : pas de
  // normalisation ici, sinon un login ultérieur avec la même saisie ne matcherait plus.
  const { email } = params

  const existant = await prisma.utilisateur.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existant) throw new EmailDejaUtiliseError()

  const passwordHash = await hashPassword(params.password)

  const admin = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: {
        nom: params.nomOrganisation.trim(),
        devise: params.devise,
        langueDefaut: params.langue,
      },
    })
    // organisationId FOURNI explicitement : flux non scopé (runUnscoped) → l'extension ne
    // l'injecte pas, mais la colonne est NOT NULL, donc on la renseigne nous-mêmes.
    return tx.utilisateur.create({
      data: {
        organisationId: org.id,
        email,
        passwordHash,
        role: 'ADMIN',
        // §4 i18n : l'admin fondateur hérite de la langue choisie à l'inscription comme
        // préférence perso (il la verra dès sa 1re session, modifiable ensuite dans Mon profil).
        langue: params.langue,
      },
      select: { id: true, email: true, role: true, organisationId: true, langue: true },
    })
  })

  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    membreId: null,
    organisationId: admin.organisationId,
    actif: true,
    langue: admin.langue,
    // L'org vient d'être créée avec cette langue par défaut (§4) et cette devise (§5).
    organisationLangueDefaut: params.langue,
    devise: params.devise,
  }
}

// ===========================================================================
// Rôle plateforme Super-Admin (SaaS §2.3) — gestion des organisations clientes.
// Toutes ces fonctions sont appelées HORS contexte d'organisation (le super-admin
// n'en a pas) : l'appelant enveloppe l'accès à un modèle scopé (Membre) dans
// `orgContext.runUnscoped`. `Organisation` n'est PAS un modèle scopé → lecture directe.
// ===========================================================================

/** Vue plateforme d'une organisation cliente (aucune donnée métier interne). */
export interface OrganisationResume {
  id: string
  nom: string
  devise: Devise
  langueDefaut: Langue
  actif: boolean
  createdAt: Date
  /** Nombre de membres — indicateur de volume, pas d'accès aux membres eux-mêmes. */
  nbMembres: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlateformePrisma {
  organisation: {
    findMany(args: any): Promise<any[]>
    update(args: any): Promise<any>
  }
  membre: { groupBy(args: any): Promise<any[]> }
}
export interface OrganisationActifPrisma {
  organisation: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Liste les organisations clientes avec leur statut, date de création et nombre de membres.
 * Le comptage passe par un `groupBy` unique (Membre scopé → l'appelant est en `runUnscoped`),
 * pas une requête par organisation.
 */
export async function listerOrganisations(
  prisma: PlateformePrisma,
): Promise<OrganisationResume[]> {
  const orgs = await prisma.organisation.findMany({
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const parOrg = await prisma.membre.groupBy({
    by: ['organisationId'],
    _count: { _all: true },
  })
  const compteur = new Map<string, number>()
  for (const ligne of parOrg) {
    compteur.set(ligne.organisationId, ligne._count?._all ?? 0)
  }

  return orgs.map((o) => ({
    id: o.id,
    nom: o.nom,
    devise: o.devise,
    langueDefaut: o.langueDefaut,
    actif: o.actif,
    createdAt: o.createdAt,
    nbMembres: compteur.get(o.id) ?? 0,
  }))
}

/**
 * Suspend (`actif = false`) ou réactive (`actif = true`) une organisation (§2.3 : bloque
 * l'accès, ne supprime AUCUNE donnée). Lève une erreur Prisma P2025 si l'id est inconnu
 * (mappée en 404 par la route). Ne touche jamais aux données métier de l'organisation.
 */
export async function definirStatutOrganisation(
  prisma: PlateformePrisma,
  id: string,
  actif: boolean,
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    data: { actif },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      createdAt: true,
    },
  })
  return org
}

/**
 * Statut d'activité d'une organisation, pour bloquer login/refresh d'un espace suspendu
 * (§2.3). Retourne `null` si l'organisation est introuvable (traité comme suspendu par
 * l'appelant, par prudence).
 */
export async function chargerOrganisationActif(
  prisma: OrganisationActifPrisma,
  organisationId: string,
): Promise<boolean | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { actif: true },
  })
  if (!org) return null
  return org.actif as boolean
}
