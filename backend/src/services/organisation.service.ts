import { hashPassword } from './auth.service'
import type { AuthenticatedUser } from './auth.service'
import { limiteMembresForfait, type Forfait } from '../lib/forfait'

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
    nomOrganisation: params.nomOrganisation.trim(),
    // Compte tout juste créé : époque de session initiale (M5).
    sessionEpoch: 0,
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
  /** Forfait courant (SaaS §3.1) — attribué par le SUPER_ADMIN. */
  forfait: Forfait
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
      forfait: true,
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
    forfait: o.forfait,
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
      forfait: true,
      createdAt: true,
    },
  })
  return org
}

/**
 * Change le FORFAIT d'une organisation (SaaS §3.1) — action PLATEFORME réservée au SUPER_ADMIN
 * (activation manuelle, pas de paiement). Lève une erreur Prisma P2025 si l'id est inconnu
 * (mappée en 404 par la route). Ne touche à aucune donnée métier ; les nouvelles limites
 * s'appliquent dès le prochain contrôle de quota.
 */
export async function definirForfaitOrganisation(
  prisma: PlateformePrisma,
  id: string,
  forfait: Forfait,
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    // FK/scalaire directe (Organisation n'est pas un modèle scopé).
    data: { forfait },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      forfait: true,
      createdAt: true,
    },
  })
  return org
}

// ===========================================================================
// Paramètres de l'organisation COURANTE (§5) — vue lecture seule pour ses propres membres
// du bureau. Contrairement aux fonctions plateforme ci-dessus, ceci s'exécute DANS le contexte
// d'organisation de l'utilisateur : le comptage des membres (`membre.count`) est donc scopé
// automatiquement par l'extension d'isolation (pas de `runUnscoped`, pas de filtre explicite).
// ===========================================================================

/** Paramètres immuables de l'organisation + volume actuel de membres et sa limite de forfait. */
export interface OrganisationCourante {
  id: string
  nom: string
  devise: Devise
  langueDefaut: Langue
  createdAt: Date
  /** Forfait courant (SaaS §3.1). */
  forfait: Forfait
  /** Nombre de membres ACTIFS (les fiches décédées/inactives ne consomment pas le quota). */
  nbMembres: number
  /** Plafond du forfait — pour situer `nbMembres` (ex. 42 / 50). `null` = illimité (Pro/Entreprise). */
  limiteMembres: number | null
  /** Chef de l'organisation (Membre désigné) — null si non désigné. */
  chefMembreId: string | null
  /** Surnom / titre honorifique du chef, affiché à côté de son nom. Null si absent. */
  chefSurnom: string | null
  /** Nom/prénom du chef pour l'affichage (null si aucun chef désigné). */
  chefNom: string | null
  chefPrenom: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface OrganisationCourantePrisma {
  organisation: { findUnique(args: any): Promise<any> }
  membre: { count(args?: any): Promise<number> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Charge les paramètres de l'organisation de l'utilisateur connecté (nom/devise/langue défaut,
 * date de création) + le nombre de membres actuels face à la limite du forfait. `Organisation`
 * n'est pas un modèle scopé → lecture par id ; `membre.count()` est scopé par le contexte org.
 * Retourne `null` si l'organisation est introuvable (incohérence → 404 côté route).
 */
export async function chargerOrganisationCourante(
  prisma: OrganisationCourantePrisma,
  organisationId: string,
): Promise<OrganisationCourante | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      forfait: true,
      createdAt: true,
      chefMembreId: true,
      chefSurnom: true,
      // Nom/prénom du chef pour l'affichage. Le chef appartient toujours à cette org (garanti à
      // l'écriture) → lecture par la relation, sûre.
      chef: { select: { nom: true, prenom: true } },
    },
  })
  if (!org) return null
  // Quota du forfait = membres ACTIFS uniquement (les fiches DECEDE/INACTIF, conservées pour
  // l'historique, ne comptent pas). Comptage scopé par le contexte org (extension d'isolation).
  const nbMembres = await prisma.membre.count({ where: { statut: 'ACTIF' } })
  return {
    id: org.id,
    nom: org.nom,
    devise: org.devise,
    langueDefaut: org.langueDefaut,
    forfait: org.forfait,
    createdAt: org.createdAt,
    nbMembres,
    limiteMembres: limiteMembresForfait(org.forfait),
    chefMembreId: org.chefMembreId ?? null,
    chefSurnom: org.chefSurnom ?? null,
    chefNom: org.chef?.nom ?? null,
    chefPrenom: org.chef?.prenom ?? null,
  }
}

// ===========================================================================
// Chef de l'organisation (§ dirigeant) — ACTION MUTABLE, réservée ADMIN/PRESIDENT côté route.
// Distincte des paramètres immuables (§5). S'exécute DANS le contexte d'organisation :
//   - la validation d'appartenance du membre passe par une lecture SCOPÉE (Membre) → un membre
//     d'une AUTRE org renvoie null (isolation tenant) → refus ;
//   - l'écriture cible `Organisation` (modèle NON scopé) par id, en FK SCALAIRE (chefMembreId),
//     jamais `{ connect }` (cf. CLAUDE.md — écritures scopées en scalaire).
// ===========================================================================

/** Membre désigné comme chef mais introuvable dans l'organisation courante (→ 404 côté route). */
export class MembreHorsOrganisationError extends Error {
  readonly membreId: string
  constructor(membreId: string) {
    super(`Membre ${membreId} introuvable dans l'organisation courante.`)
    this.name = 'MembreHorsOrganisationError'
    this.membreId = membreId
  }
}

/** Chef désigné (renvoyé après désignation/retrait) — null partout si le chef a été retiré. */
export interface ChefOrganisation {
  chefMembreId: string | null
  chefSurnom: string | null
  chefNom: string | null
  chefPrenom: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ChefOrganisationPrisma {
  membre: { findUnique(args: any): Promise<any> }
  organisation: { update(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Désigne (ou retire, si `membreId === null`) le chef de l'organisation courante.
 *
 * - `membreId` non null : on VÉRIFIE d'abord son appartenance à l'org via une lecture scopée
 *   (`membre.findUnique`) — un membre inexistant OU d'une autre org (extension d'isolation → null)
 *   lève `MembreHorsOrganisationError`. Puis on écrit `chefMembreId` + `chefSurnom` (trim, ou null).
 * - `membreId === null` : retrait pur (chef + surnom remis à null), sans lecture de membre.
 */
export async function definirChefOrganisation(
  prisma: ChefOrganisationPrisma,
  organisationId: string,
  membreId: string | null,
  surnom: string | null,
): Promise<ChefOrganisation> {
  if (membreId !== null) {
    const membre = await prisma.membre.findUnique({
      where: { id: membreId },
      select: { id: true },
    })
    if (!membre) throw new MembreHorsOrganisationError(membreId)
  }

  const surnomNettoye = membreId !== null && surnom ? surnom.trim() || null : null

  const org = await prisma.organisation.update({
    where: { id: organisationId },
    // FK SCALAIRE (chefMembreId), pas `{ connect }` — cf. CLAUDE.md.
    data: { chefMembreId: membreId, chefSurnom: surnomNettoye },
    select: {
      chefMembreId: true,
      chefSurnom: true,
      chef: { select: { nom: true, prenom: true } },
    },
  })

  return {
    chefMembreId: org.chefMembreId ?? null,
    chefSurnom: org.chefSurnom ?? null,
    chefNom: org.chef?.nom ?? null,
    chefPrenom: org.chef?.prenom ?? null,
  }
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
