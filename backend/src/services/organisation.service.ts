import { ErreurMetier } from '../lib/erreur-metier'
import { hashPassword } from './auth.service'
import type { AuthenticatedUser } from './auth.service'
import {
  capacitesEffectives,
  etatForfait,
  forfaitEffectif,
  joursRestants,
  limiteMembresForfait,
  nouvelleEcheance,
  paiementEnLigneAutorise,
  vueEcheance,
  type CapacitesForfait,
  type EtatForfait,
  type Forfait,
  type PeriodeProlongation,
  type VueEcheance,
} from '../lib/forfait'
import { stockageUtiliseOctets } from './capacites-organisation.service'

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
export class EmailDejaUtiliseError extends ErreurMetier {
  constructor() {
    super(
      409,
      'organisations.inscriptionImpossible',
      "Impossible de créer cet espace avec ces informations.",
    )
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

/**
 * Vue plateforme d'une organisation cliente (aucune donnée métier interne). Porte les champs
 * d'échéance CALCULÉS (spec 1.1 §2.3) : la console les affiche sans les recalculer.
 */
export interface OrganisationResume extends VueEcheance {
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
  /** Espace de démonstration (spec 2026-09-15) : listé, exclu des indicateurs, non modifiable. */
  estDemo: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlateformePrisma {
  organisation: {
    findMany(args: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    update(args: any): Promise<any>
    updateMany(args: any): Promise<{ count: number }>
  }
  membre: { groupBy(args: any): Promise<any[]> }
}
export interface OrganisationActifPrisma {
  organisation: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Colonnes d'une vue plateforme d'organisation — échéance comprise, pour calculer `VueEcheance`. */
const SELECT_ORGANISATION_PLATEFORME = {
  id: true,
  nom: true,
  devise: true,
  langueDefaut: true,
  actif: true,
  forfait: true,
  forfaitExpireLe: true,
  createdAt: true,
  estDemo: true,
} as const

/** Ligne lue avec `SELECT_ORGANISATION_PLATEFORME` → vue plateforme (sans compteur de membres). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versVuePlateforme(o: any, now: Date): Omit<OrganisationResume, 'nbMembres'> {
  return {
    id: o.id,
    nom: o.nom,
    devise: o.devise,
    langueDefaut: o.langueDefaut,
    actif: o.actif,
    forfait: o.forfait,
    createdAt: o.createdAt,
    estDemo: o.estDemo === true,
    ...vueEcheance(o.forfait, o.forfaitExpireLe ?? null, now),
  }
}

/**
 * Liste les organisations clientes avec leur statut, date de création et nombre de membres.
 * Le comptage passe par un `groupBy` unique (Membre scopé → l'appelant est en `runUnscoped`),
 * pas une requête par organisation.
 */
export async function listerOrganisations(
  prisma: PlateformePrisma,
  now: Date = new Date(),
): Promise<OrganisationResume[]> {
  const orgs = await prisma.organisation.findMany({
    select: SELECT_ORGANISATION_PLATEFORME,
    orderBy: { createdAt: 'desc' },
  })

  // Membres ACTIFS seulement : c'est le compteur du quota (lib/forfait), dont la console tire sa
  // barre et son signal « proche du plafond » — même règle que création, import et réactivation.
  const parOrg = await prisma.membre.groupBy({
    by: ['organisationId'],
    where: { statut: 'ACTIF' },
    _count: { _all: true },
  })
  const compteur = new Map<string, number>()
  for (const ligne of parOrg) {
    compteur.set(ligne.organisationId, ligne._count?._all ?? 0)
  }

  return orgs.map((o) => ({ ...versVuePlateforme(o, now), nbMembres: compteur.get(o.id) ?? 0 }))
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
  now: Date = new Date(),
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    data: { actif },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  return versVuePlateforme(org, now)
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
  now: Date = new Date(),
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    // FK/scalaire directe (Organisation n'est pas un modèle scopé). Repasser en GRATUIT EFFACE
    // l'échéance (spec 1.1 §2.5) : le Gratuit n'en a jamais, et une date résiduelle ressusciterait
    // un état « expiré » trompeur si l'organisation redevenait Pro plus tard.
    data: forfait === 'GRATUIT' ? { forfait, forfaitExpireLe: null } : { forfait },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  return versVuePlateforme(org, now)
}

// ===========================================================================
// Prolongation de l'échéance du forfait (spec 1.1 §2.5/§3.1) — action PLATEFORME (SUPER_ADMIN).
// ===========================================================================

/** Organisation inconnue . */
export class OrganisationIntrouvableError extends ErreurMetier {
  constructor(readonly organisationId: string) {
    super(404, 'platform.organisationIntrouvable', `Organisation introuvable : ${organisationId}`)
  }
}

/** Le forfait GRATUIT n'a pas d'échéance : rien à prolonger . */
export class ProlongationForfaitGratuitError extends ErreurMetier {
  constructor(readonly organisationId: string) {
    super(
      409,
      'platform.prolongationForfaitGratuit',
      `Forfait GRATUIT sans échéance : ${organisationId}`,
    )
  }
}

/** L'échéance a changé entre la lecture et l'écriture — prolongation concurrente . */
export class ProlongationConcurrenteError extends ErreurMetier {
  constructor(readonly organisationId: string) {
    super(
      409,
      'platform.prolongationConcurrente',
      `Échéance modifiée pendant la prolongation : ${organisationId}`,
    )
  }
}

export interface ResultatProlongation {
  /** Vue de l'organisation APRÈS prolongation (inchangée en aperçu). */
  organisation: Omit<OrganisationResume, 'nbMembres'>
  echeanceActuelle: Date | null
  nouvelleEcheance: Date
  etatApres: EtatForfait
  joursRestantsApres: number
}

/** Options de {@link prolongerForfaitOrganisation} : l'écriture EXIGE les valeurs montrées par l'aperçu. */
export type OptionsProlongation =
  | { apercu: true; now?: Date }
  | { apercu: false; echeanceAttendue: Date | null; nouvelleEcheanceAttendue: Date; now?: Date }

/**
 * Calcule — et, hors aperçu, ÉCRIT — la nouvelle échéance d'un forfait payant. Aperçu et écriture
 * passent par la MÊME fonction `nouvelleEcheance` : la console montre exactement la date écrite.
 *
 * L'écriture est liée à l'APERÇU (pas seulement à une lecture faite quelques ms plus tôt dans la
 * MÊME requête) : l'appelant hors aperçu DOIT fournir `echeanceAttendue` (l'échéance
 * qu'il a vue) et `nouvelleEcheanceAttendue` (la date qui lui a été annoncée). Si l'une des deux ne
 * correspond plus à ce que la lecture fraîche calcule ici — réponse perdue, second clic, deux
 * onglets, minuit Douala franchi entre l'aperçu et le clic — rien n'est écrit
 * (`ProlongationConcurrenteError`) : l'écriture valide ce que l'aperçu a MONTRÉ, elle ne se contente
 * pas de relire une date qui aurait pu changer entre-temps. L'`updateMany.where` porte en plus
 * `forfait: org.forfait` : un passage en GRATUIT (qui efface l'échéance) entre-temps ne doit
 * jamais se faire écraser par une prolongation qui le croit encore payant.
 */
export async function prolongerForfaitOrganisation(
  prisma: PlateformePrisma,
  id: string,
  mois: PeriodeProlongation,
  options: OptionsProlongation,
): Promise<ResultatProlongation> {
  const now = options.now ?? new Date()
  const org = await prisma.organisation.findUnique({
    where: { id },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  if (!org) throw new OrganisationIntrouvableError(id)
  if (org.forfait === 'GRATUIT') throw new ProlongationForfaitGratuitError(id)

  const echeanceActuelle: Date | null = org.forfaitExpireLe ?? null
  const echeance = nouvelleEcheance(echeanceActuelle, now, mois)
  const resultat = (ligne: unknown): ResultatProlongation => ({
    organisation: versVuePlateforme(ligne, now),
    echeanceActuelle,
    nouvelleEcheance: echeance,
    etatApres: etatForfait(org.forfait, echeance, now),
    joursRestantsApres: joursRestants(echeance, now),
  })
  if (options.apercu) return resultat(org)

  // AVANT d'écrire : l'échéance lue ou la nouvelle échéance calculée diffèrent-elles de ce que
  // l'aperçu a montré à l'opérateur ? Comparaison en ms, null-safe (deux `null` sont égaux).
  const attenduMs = options.echeanceAttendue?.getTime() ?? null
  const actuelleMs = echeanceActuelle?.getTime() ?? null
  if (attenduMs !== actuelleMs || options.nouvelleEcheanceAttendue.getTime() !== echeance.getTime()) {
    throw new ProlongationConcurrenteError(id)
  }

  const { count } = await prisma.organisation.updateMany({
    where: { id, forfait: org.forfait, forfaitExpireLe: echeanceActuelle },
    data: { forfaitExpireLe: echeance },
  })
  if (count !== 1) throw new ProlongationConcurrenteError(id)
  return resultat({ ...org, forfaitExpireLe: echeance })
}

// ===========================================================================
// Paramètres de l'organisation COURANTE (§5) — vue lecture seule pour ses propres membres
// du bureau. Contrairement aux fonctions plateforme ci-dessus, ceci s'exécute DANS le contexte
// d'organisation de l'utilisateur : le comptage des membres (`membre.count`) est donc scopé
// automatiquement par l'extension d'isolation (pas de `runUnscoped`, pas de filtre explicite).
// ===========================================================================

/**
 * Paramètres immuables de l'organisation + volume actuel de membres et sa limite de forfait, + champs
 * d'échéance CALCULÉS (spec 1.1 §3.2), affichés tels quels par l'écran Paramètres.
 */
export interface OrganisationCourante extends VueEcheance {
  id: string
  nom: string
  devise: Devise
  langueDefaut: Langue
  createdAt: Date
  /** Forfait courant (SaaS §3.1). */
  forfait: Forfait
  /** Nombre de membres ACTIFS (les fiches décédées/inactives ne consomment pas le quota). */
  nbMembres: number
  /** Plafond du forfait EFFECTIF — pour situer `nbMembres` (ex. 42 / 50). `null` = illimité. */
  limiteMembres: number | null
  /** Capacités du forfait EFFECTIF (spec 1.1 §3.2) — affichées telles quelles, jamais recalculées. */
  capacites: Readonly<CapacitesForfait>
  /** Stockage consommé : Σ `Document.tailleOctets` (photos et reçus hors quota). */
  stockageUtiliseOctets: number
  /** Droit acquis au paiement en ligne (mesure transitoire §1.3). */
  paiementEnLigneAcquis: boolean
  /** Paiement en ligne permis : capacité effective OU droit acquis. */
  paiementEnLigneInclus: boolean
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
  document: { aggregate(args: any): Promise<{ _sum: { tailleOctets: number | null } }> }
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
  now: Date = new Date(),
): Promise<OrganisationCourante | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      forfait: true,
      forfaitExpireLe: true,
      createdAt: true,
      paiementEnLigneAcquis: true,
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
  const [nbMembres, stockageUtilise] = await Promise.all([
    prisma.membre.count({ where: { statut: 'ACTIF' } }),
    stockageUtiliseOctets(prisma),
  ])
  const capacites = capacitesEffectives(org.forfait, org.forfaitExpireLe ?? null, now)
  const paiementEnLigneAcquis = Boolean(org.paiementEnLigneAcquis)
  return {
    id: org.id,
    nom: org.nom,
    devise: org.devise,
    langueDefaut: org.langueDefaut,
    forfait: org.forfait,
    createdAt: org.createdAt,
    nbMembres,
    ...vueEcheance(org.forfait, org.forfaitExpireLe ?? null, now),
    limiteMembres: limiteMembresForfait(forfaitEffectif(org.forfait, org.forfaitExpireLe ?? null, now)),
    capacites,
    stockageUtiliseOctets: stockageUtilise,
    paiementEnLigneAcquis,
    paiementEnLigneInclus: paiementEnLigneAutorise(capacites, paiementEnLigneAcquis),
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

/** Membre désigné comme chef mais introuvable dans l'organisation courante . */
export class MembreHorsOrganisationError extends ErreurMetier {
  readonly membreId: string
  constructor(membreId: string) {
    super(
      404,
      'organisations.chefMembreIntrouvable',
      `Membre ${membreId} introuvable dans l'organisation courante.`,
    )
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
 * Accès à une organisation pour login/refresh : active (§2.3) ET nature de démonstration
 * (spec 2026-09-15 §1.3 — un compte de démo n'ouvre jamais de session par ces voies). `null` si
 * introuvable. `estDemo` absent de la ligne (mock ancien) est lu comme `false`.
 */
export async function chargerAccesOrganisation(
  prisma: OrganisationActifPrisma,
  organisationId: string,
): Promise<{ actif: boolean; estDemo: boolean } | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { actif: true, estDemo: true },
  })
  if (!org) return null
  return { actif: org.actif === true, estDemo: org.estDemo === true }
}
