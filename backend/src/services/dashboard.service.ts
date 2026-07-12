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
// Réutilise le calcul d'attendu ANNUEL de Rapports (fenêtre mono-année) — pas de recalcul
// du montant attendu / du seuil ici : l'évolution mensuelle s'appuie dessus (cf. plus bas).
import { rapportPourAnnee } from './rapport.service'

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

/** Un point de l'évolution mensuelle du recouvrement (§10, année courante). */
export interface EvolutionMois {
  /** Mois de l'année, 1 (janvier) → 12 (décembre). */
  mois: number
  /** Montant encaissé ce mois-là (Σ Versement.montant, cash-flow réel). */
  collecte: number
  /** Cible mensuelle = attendu total de l'année courante / 12 (uniforme sur les 12 mois). */
  attendu: number
  /** Montant encaissé ce même mois l'année PRÉCÉDENTE (comparaison N vs N-1). 0 si aucune donnée. */
  collecteN1: number
}

/** Anniversaire d'un membre tombant dans le mois courant (dashboard « humanisé »). */
export interface AnniversaireMembre {
  id: string
  nom: string
  prenom: string
  /** Jour du mois (1 → 31). */
  jour: number
}

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
  /** Évolution mensuelle collecté vs attendu sur l'année courante (12 entrées, janv.→déc.). */
  evolutionMensuelle: EvolutionMois[]
  nombreBranches: number
  /** Membres dont l'anniversaire tombe ce mois-ci (triés par jour). */
  anniversaires: AnniversaireMembre[]
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

/**
 * Évolution MENSUELLE du recouvrement pour l'année courante (§10). Fonction PURE.
 *
 * - `collecte[m]` = Σ des versements ENCAISSÉS le mois m de l'année courante (cash-flow réel,
 *   lu au fil des `dateVersement`). Le mois est lu en UTC → déterministe, indépendant du
 *   fuseau du serveur ou du runner de tests (les dates du jour sont stockées à minuit UTC).
 * - `attendu[m]` = `totalAttenduAnnee / 12` (cible mensuelle uniforme). `totalAttenduAnnee`
 *   provient de `rapportPourAnnee` (logique d'attendu de Rapports, réutilisée — pas de recalcul).
 *
 * Les versements hors de l'année courante sont ignorés (un rejeu/relecture large reste sûr).
 */
export function construireEvolutionMensuelle(
  versements: { montant: number; dateVersement: Date | string }[],
  totalAttenduAnnee: number,
  anneeCourante: number,
  versementsN1: { montant: number; dateVersement: Date | string }[] = [],
): EvolutionMois[] {
  const ventiler = (
    liste: { montant: number; dateVersement: Date | string }[],
    annee: number,
  ): number[] => {
    const parMois = new Array<number>(12).fill(0)
    for (const v of liste) {
      const d = v.dateVersement instanceof Date ? v.dateVersement : new Date(v.dateVersement)
      if (Number.isNaN(d.getTime()) || d.getUTCFullYear() !== annee) continue
      const mois = d.getUTCMonth() // 0..11, toujours dans les bornes du tableau
      parMois[mois] = (parMois[mois] ?? 0) + v.montant
    }
    return parMois
  }
  const collecteParMois = ventiler(versements, anneeCourante)
  const collecteN1ParMois = ventiler(versementsN1, anneeCourante - 1)
  const attenduMensuel = Math.round(totalAttenduAnnee / 12)
  return collecteParMois.map((collecte, i) => ({
    mois: i + 1,
    collecte,
    attendu: attenduMensuel,
    collecteN1: collecteN1ParMois[i] ?? 0,
  }))
}

/**
 * Membres dont l'anniversaire tombe dans le mois `moisCourant` (1→12), triés par jour. Pure.
 * Mois/jour lus en UTC (déterministe). Les membres sans date de naissance sont ignorés.
 */
export function anniversairesDuMois(
  membres: { id: string; nom: string; prenom: string; dateNaissance: Date | string | null }[],
  moisCourant: number,
): AnniversaireMembre[] {
  const res: AnniversaireMembre[] = []
  for (const m of membres) {
    if (!m.dateNaissance) continue
    const d = m.dateNaissance instanceof Date ? m.dateNaissance : new Date(m.dateNaissance)
    if (Number.isNaN(d.getTime()) || d.getUTCMonth() + 1 !== moisCourant) continue
    res.push({ id: m.id, nom: m.nom, prenom: m.prenom, jour: d.getUTCDate() })
  }
  return res.sort((a, b) => a.jour - b.jour)
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
  versement: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ montant: number; dateVersement: Date }[]>
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
  // Bornes UTC : versements de l'année courante + de l'année précédente (comparaison N vs N-1).
  const debutAnneePrecedente = new Date(Date.UTC(anneeCourante - 1, 0, 1))
  const debutAnnee = new Date(Date.UTC(anneeCourante, 0, 1))
  const debutAnneeSuivante = new Date(Date.UTC(anneeCourante + 1, 0, 1))

  const [baremes, membres, nombreBranches, versements, versementsN1, membresAnniv] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: SELECT_BAREME }),
    prisma.membre.findMany({ select: SELECT_MEMBRE_COTISANT }),
    prisma.brancheFamiliale.count(),
    prisma.versement.findMany({
      where: { dateVersement: { gte: debutAnnee, lt: debutAnneeSuivante } },
      select: { montant: true, dateVersement: true },
    }),
    prisma.versement.findMany({
      where: { dateVersement: { gte: debutAnneePrecedente, lt: debutAnnee } },
      select: { montant: true, dateVersement: true },
    }),
    prisma.membre.findMany({
      where: { statut: { not: 'DECEDE' }, dateNaissance: { not: null } },
      select: { id: true, nom: true, prenom: true, dateNaissance: true },
    }),
  ])

  const membresActifs = membres.filter((m) => m.statut === 'ACTIF')
  const fin = agregerFinances(membresActifs, baremes, anneeCourante)

  // Évolution mensuelle : l'attendu de l'année courante réutilise `rapportPourAnnee` (Rapports),
  // ventilé sur 12 mois ; le collecté est la Σ mensuelle des versements encaissés cette année.
  const totalAttenduAnnee = rapportPourAnnee(anneeCourante, baremes, membresActifs)?.totalAttendu ?? 0
  const moisCourant = new Date().getUTCMonth() + 1

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
    evolutionMensuelle: construireEvolutionMensuelle(versements, totalAttenduAnnee, anneeCourante, versementsN1),
    nombreBranches,
    anniversaires: anniversairesDuMois(membresAnniv, moisCourant),
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
