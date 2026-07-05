/**
 * Service Équilibrage entre années — NKONI, section 4.3 de la spec.
 *
 * L'équilibrage LISSE la valorisation (`Contribution.montantValorise`) d'un membre sur
 * une plage d'années contiguës, SANS jamais toucher aux versements réels
 * (`Versement.montant`). Seule la répartition de la valorisation change ; la somme
 * totale valorisée sur la plage est conservée à l'unité près.
 *
 * Principes non négociables (§4.3 + arbitrages §0) :
 *   1. `totalPeriode` = Σ des `montantValorise` COURANTS sur [anneeDebut, anneeFin]
 *      (valeurs déjà potentiellement lissées par un équilibrage précédent).
 *   2. Répartition proposée = totalPeriode / nombreAnnees, arrondi à l'entier le plus
 *      proche pour TOUTES les années sauf la dernière, qui absorbe le reliquat →
 *      Σ montants ajustés === totalPeriode EXACTEMENT.
 *   3. Si l'utilisateur ajuste manuellement, la somme DOIT rester === totalPeriode
 *      (rejet sinon).
 *   4. Tout dans UNE transaction Prisma : création EquilibrageContribution + Details,
 *      puis update des Contribution.montantValorise.
 *   5. NE JAMAIS toucher aux lignes Versement.
 *   6. Chevauchements autorisés : on repart TOUJOURS de l'état courant, pas d'annulation
 *      du précédent → la somme réellement versée reste conservée globalement.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test).
 */

/* -------------------------------------------------------------------------- */
/* Erreurs métier (toutes mappées en 400 par la route)                        */
/* -------------------------------------------------------------------------- */

/** Plage invalide : anneeDebut > anneeFin (ou nombre d'années < 1). */
export class EquilibragePlageInvalideError extends Error {
  readonly anneeDebut: number
  readonly anneeFin: number
  constructor(anneeDebut: number, anneeFin: number) {
    super(
      `Plage d'années invalide : anneeDebut (${anneeDebut}) doit être <= anneeFin (${anneeFin}).`,
    )
    this.name = 'EquilibragePlageInvalideError'
    this.anneeDebut = anneeDebut
    this.anneeFin = anneeFin
  }
}

/** Une année de la plage n'a aucune Contribution : impossible d'équilibrer. */
export class EquilibrageAnneeManquanteError extends Error {
  readonly annee: number
  constructor(annee: number) {
    super(
      `Aucune contribution pour l'année ${annee} : ouvrez l'année avant d'équilibrer la plage.`,
    )
    this.name = 'EquilibrageAnneeManquanteError'
    this.annee = annee
  }
}

/**
 * Contrainte bloquante violée : la somme des montants ajustés ne correspond pas à
 * `totalPeriode`, ou le nombre de montants fournis ne couvre pas la plage.
 */
export class EquilibrageSommeInvalideError extends Error {
  readonly sommeAjustee: number
  readonly totalPeriode: number
  constructor(sommeAjustee: number, totalPeriode: number, detail?: string) {
    super(
      detail ??
        `La somme des montants ajustés (${sommeAjustee}) doit être égale au total de la période (${totalPeriode}).`,
    )
    this.name = 'EquilibrageSommeInvalideError'
    this.sommeAjustee = sommeAjustee
    this.totalPeriode = totalPeriode
  }
}

/* -------------------------------------------------------------------------- */
/* Fonctions pures                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Répartit `totalPeriode` sur `nombreAnnees` années (§4.3 point 3).
 *
 * Chaque année sauf la dernière reçoit `Math.round(totalPeriode / nombreAnnees)` ;
 * la dernière absorbe le reliquat, ce qui garantit `Σ === totalPeriode` EXACTEMENT,
 * quel que soit l'arrondi.
 *
 * @throws EquilibragePlageInvalideError si nombreAnnees < 1.
 */
export function calculerRepartition(
  totalPeriode: number,
  nombreAnnees: number,
): number[] {
  if (!Number.isInteger(nombreAnnees) || nombreAnnees < 1) {
    throw new EquilibragePlageInvalideError(nombreAnnees, nombreAnnees)
  }
  const base = Math.round(totalPeriode / nombreAnnees)
  const montants: number[] = new Array(nombreAnnees - 1).fill(base)
  // La dernière année absorbe le reliquat pour garantir l'égalité exacte de la somme.
  montants.push(totalPeriode - base * (nombreAnnees - 1))
  return montants
}

/** Contribution courante d'une année, telle que lue en base (valorisation courante). */
export interface ContributionPeriode {
  id: string
  annee: number
  montantValorise: number
}

/** Une ligne d'équilibrage : ce que devient une année donnée. */
export interface LigneEquilibrage {
  annee: number
  contributionId: string
  montantAvant: number
  montantApres: number
}

export interface RepartitionPreparee {
  totalPeriode: number
  nombreAnnees: number
  lignes: LigneEquilibrage[]
}

/**
 * Prépare (sans écrire) l'équilibrage d'une plage à partir des contributions courantes.
 * Fonction PURE : validation de la plage, couverture complète, calcul du total et de la
 * répartition (proposée ou ajustée). Partagée par la simulation et l'application réelle.
 *
 * `montantsAjustes`, s'il est fourni, est ordonné par année croissante (anneeDebut → anneeFin)
 * et doit contenir exactement `nombreAnnees` valeurs dont la somme === totalPeriode.
 *
 * @throws EquilibragePlageInvalideError | EquilibrageAnneeManquanteError | EquilibrageSommeInvalideError
 */
export function preparerRepartition(
  contributions: ContributionPeriode[],
  anneeDebut: number,
  anneeFin: number,
  montantsAjustes?: number[],
): RepartitionPreparee {
  if (anneeDebut > anneeFin) {
    throw new EquilibragePlageInvalideError(anneeDebut, anneeFin)
  }
  const nombreAnnees = anneeFin - anneeDebut + 1

  // Indexe les contributions par année (en ignorant celles hors plage par sécurité).
  const parAnnee = new Map<number, ContributionPeriode>()
  for (const c of contributions) {
    if (c.annee >= anneeDebut && c.annee <= anneeFin) parAnnee.set(c.annee, c)
  }

  // Couverture complète exigée : chaque année de la plage doit avoir une contribution.
  const anneesOrdonnees: number[] = []
  for (let a = anneeDebut; a <= anneeFin; a++) {
    if (!parAnnee.has(a)) throw new EquilibrageAnneeManquanteError(a)
    anneesOrdonnees.push(a)
  }

  const totalPeriode = anneesOrdonnees.reduce(
    (somme, a) => somme + parAnnee.get(a)!.montantValorise,
    0,
  )

  let montants: number[]
  if (montantsAjustes !== undefined) {
    if (montantsAjustes.length !== nombreAnnees) {
      throw new EquilibrageSommeInvalideError(
        NaN,
        totalPeriode,
        `Il faut exactement ${nombreAnnees} montant(s) ajusté(s) pour la plage ${anneeDebut}-${anneeFin}, ${montantsAjustes.length} fourni(s).`,
      )
    }
    const sommeAjustee = montantsAjustes.reduce((s, m) => s + m, 0)
    if (sommeAjustee !== totalPeriode) {
      // Contrainte bloquante §4.3 point 4 : rejet si la somme diffère du total.
      throw new EquilibrageSommeInvalideError(sommeAjustee, totalPeriode)
    }
    montants = montantsAjustes
  } else {
    montants = calculerRepartition(totalPeriode, nombreAnnees)
  }

  const lignes: LigneEquilibrage[] = anneesOrdonnees.map((a, i) => {
    const c = parAnnee.get(a)!
    // montants a exactement `nombreAnnees` éléments (== anneesOrdonnees.length), donc
    // montants[i] est toujours défini ici.
    return {
      annee: a,
      contributionId: c.id,
      montantAvant: c.montantValorise,
      montantApres: montants[i]!,
    }
  })

  return { totalPeriode, nombreAnnees, lignes }
}

/* -------------------------------------------------------------------------- */
/* Accès Prisma (surface minimale, mockable)                                  */
/* -------------------------------------------------------------------------- */

/** Surface Prisma minimale utilisée par le service (mockable en test). */
export interface EquilibragePrisma {
  contribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(args: any): Promise<any>
  }
  equilibrageContribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
  }
  equilibrageDetail: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMany(args: any): Promise<any>
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

async function lireContributionsPeriode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { contribution: { findMany(args: any): Promise<any[]> } },
  membreId: string,
  anneeDebut: number,
  anneeFin: number,
): Promise<ContributionPeriode[]> {
  return client.contribution.findMany({
    where: { membreId, annee: { gte: anneeDebut, lte: anneeFin } },
    select: { id: true, annee: true, montantValorise: true },
    orderBy: { annee: 'asc' },
  }) as Promise<ContributionPeriode[]>
}

/* -------------------------------------------------------------------------- */
/* Simulation (preview, aucune écriture)                                      */
/* -------------------------------------------------------------------------- */

export interface SimulationParams {
  membreId: string
  anneeDebut: number
  anneeFin: number
}

export interface SimulationLigne {
  annee: number
  montantAvant: number
  montantPropose: number
}

export interface SimulationResult {
  membreId: string
  anneeDebut: number
  anneeFin: number
  nombreAnnees: number
  totalPeriode: number
  repartition: SimulationLigne[]
}

/**
 * Simule un équilibrage : calcule la répartition proposée SANS rien écrire en base
 * (§4.3, POST /equilibrages/simuler). Lecture seule.
 */
export async function simulerEquilibrage(
  prisma: EquilibragePrisma,
  { membreId, anneeDebut, anneeFin }: SimulationParams,
): Promise<SimulationResult> {
  const contributions = await lireContributionsPeriode(
    prisma,
    membreId,
    anneeDebut,
    anneeFin,
  )
  const { totalPeriode, nombreAnnees, lignes } = preparerRepartition(
    contributions,
    anneeDebut,
    anneeFin,
  )
  return {
    membreId,
    anneeDebut,
    anneeFin,
    nombreAnnees,
    totalPeriode,
    repartition: lignes.map((l) => ({
      annee: l.annee,
      montantAvant: l.montantAvant,
      montantPropose: l.montantApres,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Application réelle (transaction)                                           */
/* -------------------------------------------------------------------------- */

export interface AppliquerEquilibrageParams {
  membreId: string
  anneeDebut: number
  anneeFin: number
  /** Montants ajustés manuellement (ordre croissant par année). Optionnel. */
  montantsAjustes?: number[]
  auteurId: string
}

/**
 * Applique réellement l'équilibrage dans UNE transaction Prisma (§4.3 point 5) :
 *   1. (RE)lit les Contribution COURANTES de la plage (état courant → chevauchements OK).
 *   2. Valide la plage, la couverture et (si fourni) la somme des montants ajustés.
 *   3. Crée EquilibrageContribution + ses EquilibrageDetail (montantAvant/Après par année).
 *   4. Met à jour Contribution.montantValorise = montantApres pour chaque année.
 *
 * Les lignes Versement ne sont JAMAIS lues ni modifiées : la somme réellement versée
 * (Σ Versement.montant, dénormalisée dans montantVerse) reste intacte. Comme chaque
 * équilibrage conserve `totalPeriode` sur sa propre plage et ne touche à rien en dehors,
 * la somme globale des montantValorise est préservée même après des équilibrages qui se
 * chevauchent (§0 « cumulatif », §4.3 point 6).
 */
export async function appliquerEquilibrage(
  prisma: EquilibragePrisma,
  { membreId, anneeDebut, anneeFin, montantsAjustes, auteurId }: AppliquerEquilibrageParams,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Lecture de l'état COURANT (dans la transaction) — jamais d'annulation du précédent.
    const contributions = await lireContributionsPeriode(
      tx,
      membreId,
      anneeDebut,
      anneeFin,
    )

    // 2. Validation + calcul (proposée ou ajustée).
    const { totalPeriode, nombreAnnees, lignes } = preparerRepartition(
      contributions,
      anneeDebut,
      anneeFin,
      montantsAjustes,
    )

    // 3. Trace d'audit : l'équilibrage + le détail avant/après par année. EquilibrageDetail
    //    est un modèle SCOPÉ → écrit via une op TOP-LEVEL (createMany) pour que l'extension
    //    lui injecte organisationId (un nested create ne serait pas ré-scopé → org nul,
    //    interdit depuis la Phase B NOT NULL). L'équilibrage et ses détails restent atomiques
    //    (même transaction `tx`).
    const cree = await tx.equilibrageContribution.create({
      data: { membreId, anneeDebut, anneeFin, totalPeriode, auteurId },
    })
    await tx.equilibrageDetail.createMany({
      data: lignes.map((l) => ({
        equilibrageId: cree.id,
        annee: l.annee,
        montantAvant: l.montantAvant,
        montantApres: l.montantApres,
      })),
    })
    const equilibrage = await tx.equilibrageContribution.findUnique({
      where: { id: cree.id },
      include: { details: true },
    })

    // 4. Application de la nouvelle valorisation. `montantValorise` est REMPLACÉ ici
    //    (seul endroit autorisé, §3.1) — jamais incrémenté : c'est une redistribution.
    //    On ne touche à AUCUNE ligne Versement.
    for (const l of lignes) {
      await tx.contribution.update({
        where: { id: l.contributionId },
        data: { montantValorise: l.montantApres },
      })
    }

    return { equilibrage, totalPeriode, nombreAnnees, lignes }
  })
}

/* -------------------------------------------------------------------------- */
/* Lecture de l'historique                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Liste les équilibrages (optionnellement filtrés par membre), détails inclus,
 * du plus récent au plus ancien.
 */
export async function listerEquilibrages(
  prisma: EquilibragePrisma,
  membreId?: string,
) {
  return prisma.equilibrageContribution.findMany({
    where: membreId !== undefined ? { membreId } : {},
    include: { details: { orderBy: { annee: 'asc' } } },
    orderBy: { dateApplication: 'desc' },
  })
}
