import { Prisma } from '../generated/prisma/client'
import { FonctionIntrouvableError } from './fonction.service'

/**
 * V1.1 (§5) — Historique des nominations (AffectationFonction).
 *
 * RÈGLE MÉTIER CENTRALE — MONO-TITULAIRE AVEC CLÔTURE AUTOMATIQUE :
 * une fonction n'a qu'UNE affectation active (dateFin=null) à la fois. Nommer un
 * nouveau titulaire clôture automatiquement l'affectation active précédente, dans
 * une TRANSACTION avec la création de la nouvelle (atomicité : jamais deux titulaires
 * simultanés, jamais de perte de la nouvelle affectation si la clôture échoue).
 *
 * Convention d'intervalle (documentée) : bornes SEMI-OUVERTES [dateDebut, dateFin).
 * La clôture pose dateFin(ancienne) = dateDebut(nouvelle) — PAS « la veille » : pas de
 * trou ni de recouvrement, et « qui occupe la fonction à l'instant T » est unique.
 *
 * Historique IMMUABLE : aucune suppression physique d'une affectation clôturée. Le
 * seul point d'écriture est la création (qui clôture la précédente) — il n'y a
 * volontairement pas d'endpoint update/delete d'affectation. Un membre peut cumuler
 * plusieurs fonctions différentes simultanément (aucune restriction côté membre).
 *
 * Prisma injecté (mockable en test), à l'image des autres services.
 */

export { FonctionIntrouvableError }

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

/** Membre introuvable (titulaire visé inexistant). → 404 */
export class MembreIntrouvableError extends Error {
  constructor() {
    super('Membre introuvable.')
    this.name = 'MembreIntrouvableError'
  }
}

/**
 * dateDebut de la nouvelle affectation antérieure ou égale à celle du titulaire en
 * place : clôturer produirait un intervalle [dateDebut, dateFin) vide ou négatif
 * (incohérence d'historique). → 400
 */
export class DateDebutIncoherenteError extends Error {
  constructor() {
    super(
      "La date de début doit être postérieure à celle de l'affectation active en cours.",
    )
    this.name = 'DateDebutIncoherenteError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (minimale, mockable)                                        */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AffectationPrisma {
  fonctionFamiliale: { findUnique(args: any): Promise<any> }
  membre: { findUnique(args: any): Promise<any> }
  affectationFonction: {
    findFirst(args: any): Promise<any>
    findMany(args?: any): Promise<any[]>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
  }
  $transaction(ops: Promise<any>[]): Promise<any[]>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MEMBRE_SELECT = { id: true, nom: true, prenom: true } as const
const FONCTION_SELECT = { id: true, nom: true, description: true } as const

/** Une affectation avec son membre (titulaire) et sa fonction. */
const AFFECTATION_INCLUDE = {
  membre: { select: MEMBRE_SELECT },
  fonction: { select: FONCTION_SELECT },
} as const

/* -------------------------------------------------------------------------- */
/* Création (avec clôture automatique de la précédente, transactionnelle)     */
/* -------------------------------------------------------------------------- */

export interface CreerAffectationParams {
  fonctionId: string
  membreId: string
  dateDebut: string | Date
  notes?: string
}

/**
 * Nomme un titulaire pour une fonction. Si la fonction a déjà un titulaire actif :
 * clôture cette affectation (dateFin = dateDebut de la nouvelle) ET crée la nouvelle,
 * atomiquement. Retourne la nouvelle affectation (membre + fonction inclus).
 */
export async function creerAffectation(
  prisma: AffectationPrisma,
  params: CreerAffectationParams,
) {
  const dateDebut = new Date(params.dateDebut)

  // Existence de la fonction et du membre (FK garanties en base, mais on veut de vrais 404).
  const fonction = await prisma.fonctionFamiliale.findUnique({
    where: { id: params.fonctionId },
  })
  if (!fonction) throw new FonctionIntrouvableError()
  const membre = await prisma.membre.findUnique({ where: { id: params.membreId } })
  if (!membre) throw new MembreIntrouvableError()

  // Titulaire actif éventuel de cette fonction (invariant : 0 ou 1).
  const active = await prisma.affectationFonction.findFirst({
    where: { fonctionId: params.fonctionId, dateFin: null },
  })

  // Validation AVANT de construire les opérations : clôture cohérente = dateFin(ancienne)
  // = dateDebut(nouvelle) ; on refuse donc une dateDebut <= à celle du titulaire actif
  // (produirait un intervalle [dateDebut, dateFin) vide ou négatif).
  if (active && dateDebut <= new Date(active.dateDebut)) {
    throw new DateDebutIncoherenteError()
  }

  const creation = prisma.affectationFonction.create({
    data: {
      fonctionId: params.fonctionId,
      membreId: params.membreId,
      dateDebut,
      ...(params.notes !== undefined ? { notes: params.notes } : {}),
    },
    include: AFFECTATION_INCLUDE,
  })

  if (!active) {
    // Aucune affectation active → simple création (transaction d'une seule opération
    // pour garder un chemin homogène).
    const [created] = await prisma.$transaction([creation])
    return created
  }

  const cloture = prisma.affectationFonction.update({
    where: { id: active.id },
    data: { dateFin: dateDebut },
  })
  // Ordre : [clôture ancienne, création nouvelle] → on retourne la nouvelle.
  const [, created] = await prisma.$transaction([cloture, creation])
  return created
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                      */
/* -------------------------------------------------------------------------- */

/** Historique complet d'une fonction (actives + clôturées), plus récentes d'abord. 404 si fonction absente. */
export async function listerHistorique(prisma: AffectationPrisma, fonctionId: string) {
  const fonction = await prisma.fonctionFamiliale.findUnique({ where: { id: fonctionId } })
  if (!fonction) throw new FonctionIntrouvableError()
  return prisma.affectationFonction.findMany({
    where: { fonctionId },
    orderBy: { dateDebut: 'desc' },
    include: { membre: { select: MEMBRE_SELECT } },
  })
}

/** Toutes les affectations actives (un titulaire par fonction occupée). */
export function listerAffectationsActives(prisma: AffectationPrisma) {
  return prisma.affectationFonction.findMany({
    where: { dateFin: null },
    orderBy: { dateDebut: 'desc' },
    include: AFFECTATION_INCLUDE,
  })
}

/** Toutes les fonctions occupées par un membre (actives + passées), plus récentes d'abord. 404 si membre absent. */
export async function listerParMembre(prisma: AffectationPrisma, membreId: string) {
  const membre = await prisma.membre.findUnique({ where: { id: membreId } })
  if (!membre) throw new MembreIntrouvableError()
  return prisma.affectationFonction.findMany({
    where: { membreId },
    orderBy: { dateDebut: 'desc' },
    include: { fonction: { select: FONCTION_SELECT } },
  })
}
