import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'
import type { Role } from '../middlewares/permissions'

/**
 * V2 (§4.4) — Conflits familiaux. MODULE SENSIBLE (données de litiges familiaux).
 *
 * La visibilité d'un conflit dépend de son `niveauConfidentialite` ET de l'identité
 * + rôle du demandeur. Cette règle est isolée dans la fonction PURE `peutVoirConflit`
 * (comme calculerStatutContribution) : source de vérité UNIQUE, utilisée à la fois pour
 * filtrer la liste (GET /conflits) et pour autoriser un accès unitaire (GET /conflits/:id).
 * On ne duplique JAMAIS cette logique dans une clause `where` Prisma — un filtre DB
 * divergent serait une faille. On charge puis on filtre en mémoire avec la fonction pure
 * (échelle « app familiale » : volumétrie faible, sécurité prioritaire sur la perf).
 *
 * GUIDE_RELIGIEUX est exclu TOTALEMENT (même des PUBLIC) — convention transverse projet.
 * `GET /conflits/:id` non autorisé renvoie 404 (PAS 403) : ne pas divulguer l'existence
 * d'un litige à un tiers (exception documentée au pattern 403 du reste du projet).
 */

type NiveauConfidentialite = 'PUBLIC' | 'BUREAU' | 'CONFIDENTIEL'
type StatutConflit = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'CLOS'

/** Identité minimale du demandeur (issue de req.user : `id` = id Utilisateur = sub JWT). */
export interface DemandeurConflit {
  id?: string
  role: Role
}

/** Sous-ensemble d'un conflit nécessaire à la décision d'accès (structural — testable seul). */
export interface ConflitAcces {
  niveauConfidentialite: NiveauConfidentialite
  auteurId: string
  responsableSuiviId: string | null
}

/* -------------------------------------------------------------------------- */
/* RÈGLE D'ACCÈS — fonction pure (cœur sensible du module)                     */
/* -------------------------------------------------------------------------- */

/**
 * Le demandeur `u` a-t-il le droit de VOIR ce conflit ?
 *
 *   - PUBLIC       → tout utilisateur authentifié (tous rôles)
 *   - BUREAU       → ADMIN, PRESIDENT, SECRETAIRE uniquement
 *   - CONFIDENTIEL → auteur, responsable de suivi désigné, ADMIN uniquement
 *
 * L'ADMIN voit tout (bureau + suivi). Défaut FERMÉ : niveau inconnu → refus.
 */
export function peutVoirConflit(conflit: ConflitAcces, u: DemandeurConflit): boolean {
  // L'ADMIN a toujours accès (bureau exécutif + supervision).
  if (u.role === 'ADMIN') return true
  // GUIDE_RELIGIEUX est exclu TOTALEMENT du module Conflits, y compris les PUBLIC :
  // convention transverse du projet (« GUIDE_RELIGIEUX = aucun droit sur les entités
  // MVP/V1.1 » ; son périmètre V2 se limite aux commémorations/cérémonies).
  if (u.role === 'GUIDE_RELIGIEUX') return false

  switch (conflit.niveauConfidentialite) {
    case 'PUBLIC':
      return true
    case 'BUREAU':
      return u.role === 'PRESIDENT' || u.role === 'SECRETAIRE'
    case 'CONFIDENTIEL':
      // Seuls l'auteur et le responsable de suivi désigné (hors ADMIN, déjà traité).
      return (
        u.id !== undefined &&
        (u.id === conflit.auteurId || u.id === conflit.responsableSuiviId)
      )
    default:
      // Défaut fermé : tout niveau non reconnu est refusé.
      return false
  }
}

/**
 * Le demandeur `u` a-t-il le droit de MODIFIER ce conflit (statut / notes) ?
 * Plus strict que la lecture : auteur, responsable de suivi, ou ADMIN.
 * (La route exige AUSSI `peutVoirConflit` — on ne modifie jamais ce qu'on ne peut voir.)
 */
export function peutModifierConflit(conflit: ConflitAcces, u: DemandeurConflit): boolean {
  if (u.role === 'ADMIN') return true
  // GUIDE_RELIGIEUX exclu du module (cf. peutVoirConflit).
  if (u.role === 'GUIDE_RELIGIEUX') return false
  return (
    u.id !== undefined &&
    (u.id === conflit.auteurId || u.id === conflit.responsableSuiviId)
  )
}

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Conflit introuvable. → 404 */
export class ConflitIntrouvableError extends Error {
  constructor() {
    super('Conflit introuvable.')
    this.name = 'ConflitIntrouvableError'
  }
}

/** Le demandeur n'a pas le droit de voir/modifier CE conflit. → 403 */
export class AccesConflitRefuseError extends Error {
  constructor() {
    super("Vous n'avez pas accès à ce conflit.")
    this.name = 'AccesConflitRefuseError'
  }
}

/** responsableSuiviId fourni pour un niveau ≠ CONFIDENTIEL (incohérent). → 400 */
export class NiveauResponsableIncoherentError extends Error {
  constructor() {
    super('Un responsable de suivi ne peut être désigné que pour un conflit CONFIDENTIEL.')
    this.name = 'NiveauResponsableIncoherentError'
  }
}

/** responsableSuiviId ne référence aucun compte utilisateur. → 400 */
export class ResponsableIntrouvableError extends Error {
  constructor() {
    super('Le responsable de suivi désigné est introuvable.')
    this.name = 'ResponsableIntrouvableError'
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
export interface ConflitPrisma {
  conflit: {
    findMany(args?: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
  }
  // Table de jointure explicite : les liens sont écrits via des opérations TOP-LEVEL
  // (scopées par l'extension d'isolation), jamais via un nested connect non re-scopé.
  conflitMembreConcerne: { createMany(args: any): Promise<any> }
  utilisateur: {
    findUnique(args: any): Promise<any>
    findMany(args: any): Promise<any[]>
  }
  membre: { findMany(args: any): Promise<any[]> }
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Include exposé. IMPORTANT : on ne renvoie JAMAIS l'objet Utilisateur complet
 * (passwordHash) — uniquement des champs sûrs pour l'auteur / le responsable.
 * `membresConcernes` = lignes de jointure explicites → on projette le membre imbriqué.
 */
const CONFLIT_INCLUDE = {
  auteur: { select: { id: true, email: true, role: true } },
  responsableSuivi: { select: { id: true, email: true, role: true } },
  membresConcernes: { select: { membre: { select: { id: true, nom: true, prenom: true } } } },
} as const

/**
 * Aplati les lignes de jointure `membresConcernes` ([{ membre: {…} }]) en `[{id,nom,prenom}]`,
 * pour conserver la forme de réponse HISTORIQUE de l'API (indépendante du schéma DB : le
 * passage au join explicite ne doit pas modifier le contrat des routes /conflits).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projeter(conflit: any): any {
  if (!conflit) return conflit
  return {
    ...conflit,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membresConcernes: (conflit.membresConcernes ?? []).map((j: any) => j.membre),
  }
}

/**
 * Liste légère des comptes ACTIFS pouvant être désignés responsable de suivi (id + email
 * + rôle uniquement, jamais passwordHash). Sert à peupler le sélecteur du formulaire de
 * déclaration — réservé aux déclarants (cf. route : requirePermission Conflit `create`).
 */
export function listerResponsablesPossibles(prisma: ConflitPrisma) {
  return prisma.utilisateur.findMany({
    where: { actif: true },
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })
}

/* -------------------------------------------------------------------------- */
/* Lecture (filtrée par la règle d'accès)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Liste les conflits VISIBLES par `u`. On charge tout puis on filtre avec la fonction
 * pure `peutVoirConflit` : jamais renvoyé un conflit que `u` n'a pas le droit de voir.
 */
export async function listerConflitsVisibles(prisma: ConflitPrisma, u: DemandeurConflit) {
  const tous = await prisma.conflit.findMany({
    orderBy: { dateOuverture: 'desc' },
    include: CONFLIT_INCLUDE,
  })
  return tous.filter((c) => peutVoirConflit(c, u)).map(projeter)
}

/**
 * Récupère un conflit si `u` est autorisé à le voir.
 *
 * EXCEPTION VOLONTAIRE au pattern du projet (403 sur accès refusé) : ici un conflit
 * non autorisé renvoie **404, PAS 403**. Les litiges familiaux sont sensibles : même
 * l'EXISTENCE d'un conflit à un id donné ne doit pas fuiter vers un tiers non autorisé
 * (un 403 confirmerait « il existe bien un conflit ici, mais tu n'y as pas accès »).
 * On rend donc « inexistant » et « non autorisé » indiscernables de l'extérieur.
 */
export async function getConflitSiAutorise(
  prisma: ConflitPrisma,
  id: string,
  u: DemandeurConflit,
) {
  const conflit = await prisma.conflit.findUnique({ where: { id }, include: CONFLIT_INCLUDE })
  if (!conflit || !peutVoirConflit(conflit, u)) throw new ConflitIntrouvableError()
  return projeter(conflit)
}

/* -------------------------------------------------------------------------- */
/* Création                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreerConflitParams {
  titre: string
  description: string
  niveauConfidentialite: NiveauConfidentialite
  /** Pertinent seulement si niveauConfidentialite = CONFIDENTIEL (désigné à la création). */
  responsableSuiviId?: string
  /** Ids des membres parties prenantes du litige. */
  membresConcernes?: string[]
  notes?: string
}

/**
 * Crée un conflit. `auteurId` provient du demandeur authentifié (req.user.sub), jamais
 * du corps de requête. Valide la cohérence responsable/niveau et l'existence des FK.
 */
export async function creerConflit(
  prisma: ConflitPrisma,
  params: CreerConflitParams,
  auteurId: string,
) {
  // Le responsable de suivi n'a de sens que pour un conflit CONFIDENTIEL.
  if (params.responsableSuiviId && params.niveauConfidentialite !== 'CONFIDENTIEL') {
    throw new NiveauResponsableIncoherentError()
  }
  if (params.responsableSuiviId) {
    const resp = await prisma.utilisateur.findUnique({ where: { id: params.responsableSuiviId } })
    if (!resp) throw new ResponsableIntrouvableError()
  }
  const membreIds = params.membresConcernes ?? []
  if (membreIds.length > 0) {
    const trouves = await prisma.membre.findMany({
      where: { id: { in: membreIds } },
      select: { id: true },
    })
    if (trouves.length !== new Set(membreIds).size) throw new MembreConcerneIntrouvableError()
  }

  const data: CreationScopee<Prisma.ConflitCreateInput> = {
    titre: params.titre,
    description: params.description,
    niveauConfidentialite: params.niveauConfidentialite,
    auteur: { connect: { id: auteurId } },
    ...(params.notes !== undefined ? { notes: params.notes } : {}),
    ...(params.responsableSuiviId
      ? { responsableSuivi: { connect: { id: params.responsableSuiviId } } }
      : {}),
  }

  // Atomique : le conflit ET ses liens membres dans une transaction. Les liens sont écrits
  // via `conflitMembreConcerne.createMany` (opération TOP-LEVEL) → l'extension d'isolation
  // y injecte `organisationId` (même mécanisme que le reste), pas un nested connect.
  const conflit = await prisma.$transaction(async (tx) => {
    const cree = await tx.conflit.create({ data })
    if (membreIds.length > 0) {
      await tx.conflitMembreConcerne.createMany({
        data: membreIds.map((mid) => ({ conflitId: cree.id, membreId: mid })),
      })
    }
    return tx.conflit.findUnique({ where: { id: cree.id }, include: CONFLIT_INCLUDE })
  })
  return projeter(conflit)
}

/* -------------------------------------------------------------------------- */
/* Mise à jour (statut / notes)                                               */
/* -------------------------------------------------------------------------- */

export interface MajConflitParams {
  statut?: StatutConflit
  notes?: string | null
}

/**
 * Met à jour le suivi d'un conflit (statut, notes). Autorisé pour l'auteur, le
 * responsable de suivi ou l'ADMIN, ET à condition de pouvoir voir le conflit.
 * Passer à RESOLU/CLOS renseigne `dateResolution` (si absente) ; revenir à
 * OUVERT/EN_COURS l'efface (réouverture).
 */
export async function majConflit(
  prisma: ConflitPrisma,
  id: string,
  params: MajConflitParams,
  u: DemandeurConflit,
) {
  const conflit = await prisma.conflit.findUnique({ where: { id }, include: CONFLIT_INCLUDE })
  // Non trouvé OU non visible → 404 (même raison que getConflitSiAutorise : ne pas
  // divulguer l'existence d'un conflit à un tiers qui ne peut pas le voir).
  if (!conflit || !peutVoirConflit(conflit, u)) throw new ConflitIntrouvableError()
  // Visible mais sans droit de modification (ex. membre du bureau non-partie) → 403 :
  // ici l'existence est déjà légitimement connue du demandeur, on refuse juste l'action.
  if (!peutModifierConflit(conflit, u)) throw new AccesConflitRefuseError()

  const data: Prisma.ConflitUncheckedUpdateInput = {}
  if (params.notes !== undefined) data.notes = params.notes
  if (params.statut !== undefined) {
    data.statut = params.statut
    const cloture = params.statut === 'RESOLU' || params.statut === 'CLOS'
    if (cloture && !conflit.dateResolution) {
      data.dateResolution = new Date()
    } else if (!cloture) {
      data.dateResolution = null // réouverture → efface la date de résolution
    }
  }
  const maj = await prisma.conflit.update({ where: { id }, data, include: CONFLIT_INCLUDE })
  return projeter(maj)
}
