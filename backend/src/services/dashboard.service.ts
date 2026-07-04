/**
 * Service Tableau de bord — NKONI, §5 point 8 + matrice §2 (ligne « Tableau de bord »).
 *
 * La matrice définit 4 niveaux de vue selon le rôle :
 *   - ADMIN, PRESIDENT              → COMPLET   (structurel + financier)
 *   - TRESORIERE, COMMISSAIRE       → FINANCIER (cotisations/versements uniquement)
 *   - SECRETAIRE                    → RESTREINT (structurel uniquement, AUCUN financier)
 *   - MEMBRE_SIMPLE                 → PERSO     (ses propres données)
 *
 * Principes :
 *   - Aucun statut de contribution n'est stocké : la répartition A_JOUR/PARTIEL/NON_A_JOUR
 *     est RECALCULÉE membre par membre via `calculerStatutContribution` (fonction pure,
 *     §4.1) à partir des `montantValorise` courants.
 *   - La logique d'agrégation est isolée dans des fonctions pures (`agregerFinances`,
 *     `compterParStatutMembre`) ; chaque `calculerDashboardXxx` se limite à charger les
 *     données (Prisma injecté, mockable) puis à déléguer à ces fonctions.
 *
 * Cloisonnement des vues (exigence §2) : une vue ne renvoie JAMAIS un champ hors de son
 * périmètre. En particulier RESTREINT ne contient AUCUNE donnée financière, et FINANCIER
 * ne contient AUCUNE donnée structurelle (branches, décès…).
 */

import {
  calculerStatutContribution,
  type BaremeAnnuelInput,
  type ContributionInput,
  type StatutContributionValue,
} from './statutContribution'

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                     */
/* -------------------------------------------------------------------------- */

/** Levée par la vue PERSO si aucun membre ne correspond (→ 404 côté route). */
export class MembreIntrouvableError extends Error {
  readonly membreId: string
  constructor(membreId: string) {
    super(`Membre ${membreId} introuvable.`)
    this.name = 'MembreIntrouvableError'
    this.membreId = membreId
  }
}

/* -------------------------------------------------------------------------- */
/* Types de sortie                                                            */
/* -------------------------------------------------------------------------- */

export type StatutMembreValue = 'ACTIF' | 'INACTIF' | 'DECEDE'

export interface RepartitionStatutContribution {
  A_JOUR: number
  PARTIEL: number
  NON_A_JOUR: number
}

export interface RepartitionStatutMembre {
  ACTIF: number
  INACTIF: number
  DECEDE: number
}

export interface Finances {
  totalAttenduCumule: number
  totalCollecteCumule: number
  /** Taux de recouvrement en % (collecté / attendu), 2 décimales ; 0 si rien n'est attendu. */
  tauxRecouvrement: number
}

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardFinancier {
  vue: 'FINANCIER'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardRestreint {
  vue: 'RESTREINT'
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
}

export interface DashboardPerso {
  vue: 'PERSO'
  membreId: string
  anneeCourante: number
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContributionValue
}

/* -------------------------------------------------------------------------- */
/* Agrégations pures                                                          */
/* -------------------------------------------------------------------------- */

/** Membre porteur d'une obligation de cotisation, avec ses contributions courantes. */
export interface MembreCotisant {
  anneeAdhesion: number
  anneeFinContribution?: number | null
  contributions: ContributionInput[]
}

export interface FinancesAgregees extends Finances {
  distribution: RepartitionStatutContribution
}

/**
 * Agrège les finances (attendu/collecté/taux) et la répartition des statuts de
 * contribution sur un ensemble de membres cotisants. Fonction PURE.
 *
 * Le statut de chaque membre est recalculé via `calculerStatutContribution` — donc la
 * distribution et les totaux portent EXACTEMENT sur la même population (cohérence).
 */
export function agregerFinances(
  membres: MembreCotisant[],
  baremes: BaremeAnnuelInput[],
  anneeCourante: number,
): FinancesAgregees {
  let totalAttenduCumule = 0
  let totalCollecteCumule = 0
  const distribution: RepartitionStatutContribution = { A_JOUR: 0, PARTIEL: 0, NON_A_JOUR: 0 }

  for (const m of membres) {
    const r = calculerStatutContribution({
      baremes,
      contributions: m.contributions,
      anneeAdhesion: m.anneeAdhesion,
      anneeFinContribution: m.anneeFinContribution ?? null,
      anneeCourante,
    })
    totalAttenduCumule += r.totalAttenduCumule
    totalCollecteCumule += r.totalValoriseCumule
    distribution[r.statut] += 1
  }

  const tauxRecouvrement =
    totalAttenduCumule > 0
      ? Math.round((totalCollecteCumule / totalAttenduCumule) * 10000) / 100
      : 0

  return { totalAttenduCumule, totalCollecteCumule, tauxRecouvrement, distribution }
}

/** Compte les membres par statut de membre (ACTIF/INACTIF/DECEDE). Fonction PURE. */
export function compterParStatutMembre(
  membres: { statut: string }[],
): RepartitionStatutMembre {
  const counts: RepartitionStatutMembre = { ACTIF: 0, INACTIF: 0, DECEDE: 0 }
  for (const m of membres) {
    if (m.statut === 'ACTIF' || m.statut === 'INACTIF' || m.statut === 'DECEDE') {
      counts[m.statut] += 1
    }
  }
  return counts
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (mockable)                                                  */
/* -------------------------------------------------------------------------- */

export interface DashboardPrisma {
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ annee: number; montantAttendu: number }[]>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
  }
  brancheFamiliale: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(args?: any): Promise<number>
  }
}

const SELECT_BAREME = { annee: true, montantAttendu: true } as const
const SELECT_MEMBRE_COTISANT = {
  statut: true,
  anneeAdhesion: true,
  anneeFinContribution: true,
  contributions: { select: { annee: true, montantValorise: true } },
} as const

function baremeManquant(baremes: BaremeAnnuelInput[], annee: number): boolean {
  return !baremes.some((b) => b.annee === annee)
}

/* -------------------------------------------------------------------------- */
/* Vues                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Vue COMPLET (ADMIN, PRESIDENT) : finances (sur membres ACTIFS), répartition des statuts
 * de contribution (membres ACTIFS), répartition des statuts de membre (TOUS), nombre de
 * branches, et alerte si l'année courante n'a pas de barème configuré.
 *
 * Choix documenté : totaux et distribution des statuts de contribution portent sur les
 * membres ACTIFS (cohérent avec « tous membres actifs » du §5.8) — un membre INACTIF/DECEDE
 * ne fait plus l'objet d'un suivi de recouvrement, seul son décompte structurel est pertinent.
 */
export async function calculerDashboardComplet(
  prisma: DashboardPrisma,
  anneeCourante: number,
): Promise<DashboardComplet> {
  const [baremes, membres, nombreBranches] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: SELECT_BAREME }),
    prisma.membre.findMany({ select: SELECT_MEMBRE_COTISANT }),
    prisma.brancheFamiliale.count(),
  ])

  const membresActifs = membres.filter((m) => m.statut === 'ACTIF')
  const fin = agregerFinances(membresActifs, baremes, anneeCourante)

  return {
    vue: 'COMPLET',
    anneeCourante,
    finances: {
      totalAttenduCumule: fin.totalAttenduCumule,
      totalCollecteCumule: fin.totalCollecteCumule,
      tauxRecouvrement: fin.tauxRecouvrement,
    },
    membresParStatutContribution: fin.distribution,
    membresParStatutMembre: compterParStatutMembre(membres),
    nombreBranches,
    alertes: { baremeAnneeCouranteManquant: baremeManquant(baremes, anneeCourante) },
  }
}

/**
 * Vue FINANCIER (TRESORIERE, COMMISSAIRE_COMPTES) : sous-ensemble strictement financier du
 * complet (totaux, taux de recouvrement, répartition des statuts de contribution + alerte
 * barème). AUCUNE donnée structurelle (branches, statuts de membre, décès).
 */
export async function calculerDashboardFinancier(
  prisma: DashboardPrisma,
  anneeCourante: number,
): Promise<DashboardFinancier> {
  const [baremes, membresActifs] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: SELECT_BAREME }),
    prisma.membre.findMany({ where: { statut: 'ACTIF' }, select: SELECT_MEMBRE_COTISANT }),
  ])

  const fin = agregerFinances(membresActifs, baremes, anneeCourante)

  return {
    vue: 'FINANCIER',
    anneeCourante,
    finances: {
      totalAttenduCumule: fin.totalAttenduCumule,
      totalCollecteCumule: fin.totalCollecteCumule,
      tauxRecouvrement: fin.tauxRecouvrement,
    },
    membresParStatutContribution: fin.distribution,
    alertes: { baremeAnneeCouranteManquant: baremeManquant(baremes, anneeCourante) },
  }
}

/**
 * Vue RESTREINT (SECRETAIRE) : structurel uniquement — répartition des statuts de membre et
 * nombre de branches. AUCUNE donnée financière (le SECRETAIRE n'a aucun droit sur
 * Contribution/Versement selon la matrice §2).
 */
export async function calculerDashboardRestreint(
  prisma: DashboardPrisma,
): Promise<DashboardRestreint> {
  const [membres, nombreBranches] = await Promise.all([
    prisma.membre.findMany({ select: { statut: true } }),
    prisma.brancheFamiliale.count(),
  ])

  return {
    vue: 'RESTREINT',
    membresParStatutMembre: compterParStatutMembre(membres),
    nombreBranches,
  }
}

/**
 * Vue PERSO (MEMBRE_SIMPLE) : statut cumulatif du membre, formaté pour le dashboard.
 * Réutilise directement `calculerStatutContribution` (équivalent de GET /membres/:id/statut).
 */
export async function calculerDashboardPerso(
  prisma: DashboardPrisma,
  membreId: string,
  anneeCourante: number,
): Promise<DashboardPerso> {
  const membre = await prisma.membre.findUnique({
    where: { id: membreId },
    select: {
      anneeAdhesion: true,
      anneeFinContribution: true,
      contributions: { select: { annee: true, montantValorise: true } },
    },
  })
  if (!membre) throw new MembreIntrouvableError(membreId)

  const baremes = await prisma.baremeAnnuel.findMany({ select: SELECT_BAREME })

  const r = calculerStatutContribution({
    baremes,
    contributions: membre.contributions,
    anneeAdhesion: membre.anneeAdhesion,
    anneeFinContribution: membre.anneeFinContribution ?? null,
    anneeCourante,
  })

  return {
    vue: 'PERSO',
    membreId,
    anneeCourante,
    totalAttenduCumule: r.totalAttenduCumule,
    totalValoriseCumule: r.totalValoriseCumule,
    statut: r.statut,
  }
}
