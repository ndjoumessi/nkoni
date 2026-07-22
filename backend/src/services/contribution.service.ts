/**
 * Service Contributions — ouverture d'année (§5 point 4).
 *
 * Découplé de Fastify, Prisma injecté (mockable en test). L'année courante est INJECTABLE ; son
 * défaut passe par le fuseau applicatif (`lib/date-app.ts`), jamais par le fuseau du process.
 */

import { anneeCouranteApp } from '../lib/date-app'

/** Surface minimale de Prisma utilisée par ouvrirAnnee (mockable). */
export interface OuvrirAnneePrisma {
  baremeAnnuel: {
    // findFirst (et non findUnique) : `annee` n'est plus unique globalement mais
    // par organisation (@@unique([organisationId, annee])) → lecture scopée par l'extension.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(args: any): Promise<any>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
  }
  contribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMany(args: any): Promise<{ count: number }>
  }
}

/** Levée quand aucun BaremeAnnuel n'existe pour l'année demandée. */
export class BaremeIntrouvableError extends Error {
  readonly annee: number
  constructor(annee: number) {
    super(`Aucun barème n'est configuré pour l'année ${annee}.`)
    this.name = 'BaremeIntrouvableError'
    this.annee = annee
  }
}

/**
 * Levée quand on tente d'ouvrir une année FUTURE. Une contribution non encore due créerait un
 * écart : le montant attendu cumulé est borné à `min(anneeCourante, anneeFinContribution)` et
 * ignorerait cette ligne, alors que la fiche l'afficherait et la rendrait encaissable — l'argent
 * reçu serait alors invisible dans les totaux du membre. Configurer le BARÈME d'une année future
 * reste permis ; c'est son OUVERTURE qui attend l'échéance.
 */
export class AnneeFutureError extends Error {
  readonly annee: number
  constructor(annee: number) {
    super(`L'année ${annee} n'est pas encore ouverte à la contribution.`)
    this.name = 'AnneeFutureError'
    this.annee = annee
  }
}

/** Levée quand l'année est hors de la fenêtre d'adhésion du membre (statut NON pris en compte). */
export class MembreNonEligibleError extends Error {
  readonly annee: number
  constructor(annee: number) {
    super(`Le membre n'est pas éligible à la contribution de l'année ${annee}.`)
    this.name = 'MembreNonEligibleError'
    this.annee = annee
  }
}

export interface OuvrirAnneeResult {
  annee: number
  montantAttendu: number
  membresEligibles: number
  contributionsCreees: number
}

/** Surface Prisma de `ouvrirAnneeMembre` (mockable). */
export interface OuvrirAnneeMembrePrisma {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baremeAnnuel: { findFirst(args: any): Promise<any> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  membre: { findUnique(args: any): Promise<any> }
  contribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<any>
  }
}

/**
 * Ouvre l'année de contribution pour UN SEUL membre — pendant CIBLÉ de `ouvrirAnnee`, qui agit
 * lui sur toute l'organisation. Motivation : le montant attendu cumulé d'un membre est CALCULÉ sur
 * sa fenêtre `[anneeAdhesion .. min(anneeCourante, anneeFinContribution)]` × barèmes, alors que
 * saisir un versement exige une ligne `Contribution`. Sans ouverture ciblée, un membre adhérent
 * depuis 2023 dont les années 2023-2024 n'ont jamais été ouvertes ne pouvait pas être encaissé sur
 * ces années — alors que l'application les compte comme attendues.
 *
 * Éligibilité = `anneeAdhesion <= annee <= (anneeFinContribution ?? +∞)`, SANS filtre sur le statut :
 * c'est EXACTEMENT la fenêtre sur laquelle `rapport.service` calcule l'attendu cumulé (il ne filtre
 * pas non plus sur le statut, `anneeFinContribution` figeant déjà la fin d'obligation). Filtrer ACTIF
 * ici contredisait cet attendu : un membre DÉCÉDÉ/INACTIF dont la fenêtre couvre l'année se voyait
 * compter un attendu (ex. 36 000) qu'aucun versement ne pouvait solder (« membre non éligible »).
 * Barème obligatoire pour l'année (le `montantAttendu` est copié → historisation, jamais de création
 * silencieuse à 0). La borne « pas d'année future » (Wave 33) reste, en amont.
 *
 * IDEMPOTENT : si la contribution existe déjà, elle est renvoyée telle quelle (aucune écriture).
 * Renvoie `null` si le membre est introuvable (→ 404 côté route, pas de fuite d'existence).
 */
export async function ouvrirAnneeMembre(
  prisma: OuvrirAnneeMembrePrisma,
  membreId: string,
  annee: number,
  anneeCourante: number = anneeCouranteApp(),
): Promise<{ id: string; annee: number; montantAttendu: number } | null> {
  const existante = await prisma.contribution.findFirst({ where: { membreId, annee } })
  if (existante) return existante
  // Borne haute : jamais d'année future (idem ouverture globale). Placée APRÈS la lecture
  // idempotente pour qu'une contribution déjà créée reste consultable/encaissable.
  if (annee > anneeCourante) throw new AnneeFutureError(annee)

  const membre = await prisma.membre.findUnique({
    where: { id: membreId },
    select: { anneeAdhesion: true, anneeFinContribution: true },
  })
  if (!membre) return null

  const bareme = await prisma.baremeAnnuel.findFirst({ where: { annee } })
  if (!bareme) throw new BaremeIntrouvableError(annee)

  // Fenêtre d'adhésion SEULE (statut ignoré) — miroir exact de l'attendu cumulé (rapport.service).
  const eligible =
    membre.anneeAdhesion <= annee &&
    (membre.anneeFinContribution === null || membre.anneeFinContribution >= annee)
  if (!eligible) throw new MembreNonEligibleError(annee)

  // FK SCALAIRE (`membreId`) : l'extension d'isolation injecte `organisationId` (cf. CLAUDE.md).
  return prisma.contribution.create({
    data: { membreId, annee, montantAttendu: bareme.montantAttendu },
  })
}

/**
 * Crée automatiquement une Contribution pour chaque Membre ACTIF éligible à l'année
 * donnée, avec montantAttendu copié du BaremeAnnuel (historisation).
 *
 * Éligibilité : statut ACTIF, anneeAdhesion <= annee, et
 * (anneeFinContribution == null OU anneeFinContribution >= annee).
 *
 * - Si aucun BaremeAnnuel n'existe pour l'année → BaremeIntrouvableError (pas de
 *   création silencieuse à 0).
 * - Idempotent : `createMany({ skipDuplicates: true })` s'appuie sur le @@unique
 *   (membreId, annee) → un second appel ne recrée rien (contributionsCreees = 0).
 */
export async function ouvrirAnnee(
  prisma: OuvrirAnneePrisma,
  annee: number,
  anneeCourante: number = anneeCouranteApp(),
): Promise<OuvrirAnneeResult> {
  // Borne haute : jamais d'année future (cf. AnneeFutureError). Horloge INJECTÉE → testable.
  if (annee > anneeCourante) throw new AnneeFutureError(annee)
  const bareme = await prisma.baremeAnnuel.findFirst({ where: { annee } })
  if (!bareme) {
    throw new BaremeIntrouvableError(annee)
  }
  const montantAttendu: number = bareme.montantAttendu

  const membres = await prisma.membre.findMany({
    where: {
      statut: 'ACTIF',
      anneeAdhesion: { lte: annee },
      OR: [{ anneeFinContribution: null }, { anneeFinContribution: { gte: annee } }],
    },
    select: { id: true },
  })

  const data = membres.map((m) => ({
    membreId: m.id as string,
    annee,
    montantAttendu,
  }))

  const created =
    data.length > 0
      ? await prisma.contribution.createMany({ data, skipDuplicates: true })
      : { count: 0 }

  return {
    annee,
    montantAttendu,
    membresEligibles: membres.length,
    contributionsCreees: created.count,
  }
}
