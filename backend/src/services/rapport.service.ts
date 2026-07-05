/**
 * Service Rapports financiers — enrichissement (comparaison période vs période).
 *
 * NE crée AUCUN modèle de données : il agrège l'existant (BaremeAnnuel, Membre,
 * Contribution/montantValorise) en chiffres PAR ANNÉE, alors que le reste de l'app
 * raisonne surtout en CUMUL (§4.1). La cohérence est garantie par une réutilisation
 * stricte de la fonction pure `calculerStatutContribution` :
 *
 *   Pour un membre et une année Y, on appelle `calculerStatutContribution` avec une
 *   FENÊTRE MONO-ANNÉE (anneeAdhesion = anneeFinContribution = anneeCourante = Y). La
 *   borne interne `dansLaBorne` se réduit alors à « annee === Y », si bien que la
 *   fonction renvoie exactement l'attendu de Y (barème de Y), le valorisé de Y, et le
 *   statut de Y — SANS dupliquer le seuil A_JOUR/PARTIEL/NON_A_JOUR.
 *
 * Éligibilité d'un membre pour l'année Y : la même borne que partout ailleurs, à savoir
 *   anneeAdhesion ≤ Y ≤ (anneeFinContribution ?? +∞).
 * On NE filtre PAS sur le statut de membre : `anneeFinContribution` (renseigné pour les
 * DECEDE/INACTIF) fige déjà la fin d'obligation, donc un membre décédé reste compté sur
 * les années passées où il cotisait — ce qui est correct pour un rapport historique et
 * cohérent avec le calcul de statut cumulatif.
 *
 * Année sans BaremeAnnuel configuré : IGNORÉE (aucune ligne produite), jamais d'erreur —
 * comportement déjà décidé pour §4.1 (le barème est la source du montant attendu ; sans
 * lui il n'y a rien à réclamer). Fonctions pures → testables sans base de données.
 */

import {
  calculerStatutContribution,
  type BaremeAnnuelInput,
  type ContributionInput,
} from './statutContribution'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface RepartitionStatutContribution {
  A_JOUR: number
  PARTIEL: number
  NON_A_JOUR: number
}

/** Membre porteur d'une obligation de cotisation, avec ses contributions valorisées. */
export interface MembreRapport {
  anneeAdhesion: number
  anneeFinContribution?: number | null
  contributions: ContributionInput[]
}

/** Bloc de résultat pour une année. */
export interface RapportAnnee {
  annee: number
  /** Montant attendu par membre (barème de l'année). */
  montantAttendu: number
  membresEligibles: number
  /** montantAttendu × membresEligibles. */
  totalAttendu: number
  /** Σ des montants valorisés de l'année (sur les membres éligibles). */
  totalCollecte: number
  /** Taux de recouvrement en % (collecté / attendu), 2 décimales ; 0 si rien n'est attendu. */
  tauxRecouvrement: number
  membresParStatut: RepartitionStatutContribution
}

export interface RapportFinancier {
  anneeDebut: number
  anneeFin: number
  /** Une entrée par année de la plage AYANT un barème (années non configurées ignorées). */
  annees: RapportAnnee[]
}

/** Variation en % d'une métrique entre deux périodes (null si non calculable). */
export interface VariationsComparaison {
  totalAttendu: number | null
  totalCollecte: number | null
  tauxRecouvrement: number | null
}

export interface ComparaisonPeriodes {
  anneeA: number
  anneeB: number
  /** null si l'année n'a pas de barème configuré (ignorée, pas d'erreur). */
  rapportA: RapportAnnee | null
  rapportB: RapportAnnee | null
  /** Variation en % de A vers B pour chaque métrique. */
  variations: VariationsComparaison
}

/* -------------------------------------------------------------------------- */
/* Cœur pur                                                                   */
/* -------------------------------------------------------------------------- */

/** Arrondi à 2 décimales, comme le taux de recouvrement du dashboard. */
function arrondi2(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * Construit le bloc d'une année, ou `null` si aucun barème n'existe pour cette année.
 * Réutilise `calculerStatutContribution` en fenêtre mono-année (cf. en-tête du module).
 */
export function rapportPourAnnee(
  annee: number,
  baremes: BaremeAnnuelInput[],
  membres: MembreRapport[],
): RapportAnnee | null {
  const bareme = baremes.find((b) => b.annee === annee)
  if (!bareme) return null // année sans barème → ignorée

  let membresEligibles = 0
  let totalCollecte = 0
  const membresParStatut: RepartitionStatutContribution = { A_JOUR: 0, PARTIEL: 0, NON_A_JOUR: 0 }

  for (const m of membres) {
    const finContribution = m.anneeFinContribution ?? null
    const eligible =
      m.anneeAdhesion <= annee && (finContribution === null || annee <= finContribution)
    if (!eligible) continue

    membresEligibles += 1
    // Fenêtre mono-année : la fonction pure ne considère que l'année `annee`.
    const r = calculerStatutContribution({
      baremes,
      contributions: m.contributions,
      anneeAdhesion: annee,
      anneeFinContribution: annee,
      anneeCourante: annee,
    })
    totalCollecte += r.totalValoriseCumule
    membresParStatut[r.statut] += 1
  }

  const totalAttendu = bareme.montantAttendu * membresEligibles
  const tauxRecouvrement = totalAttendu > 0 ? arrondi2((totalCollecte / totalAttendu) * 100) : 0

  return {
    annee,
    montantAttendu: bareme.montantAttendu,
    membresEligibles,
    totalAttendu,
    totalCollecte,
    tauxRecouvrement,
    membresParStatut,
  }
}

/**
 * Rapport financier multi-années (fonction PURE). Pour chaque année de [anneeDebut,
 * anneeFin] disposant d'un barème, calcule attendu / collecté / taux / répartition des
 * statuts. Les années sans barème sont simplement absentes du résultat.
 */
export function genererRapportFinancier(
  anneeDebut: number,
  anneeFin: number,
  baremes: BaremeAnnuelInput[],
  membres: MembreRapport[],
): RapportFinancier {
  const annees: RapportAnnee[] = []
  for (let a = anneeDebut; a <= anneeFin; a++) {
    const bloc = rapportPourAnnee(a, baremes, membres)
    if (bloc) annees.push(bloc)
  }
  return { anneeDebut, anneeFin, annees }
}

/**
 * Variation en % de `depuis` vers `vers`. `null` si la base est 0 (non calculable) ou si
 * l'une des deux valeurs est absente. Positive = progression, négative = régression.
 */
export function variationPourcent(depuis: number | null, vers: number | null): number | null {
  if (depuis === null || vers === null || depuis === 0) return null
  return arrondi2(((vers - depuis) / depuis) * 100)
}

/**
 * Compare deux années (fonction PURE) : renvoie les deux blocs annuels côte à côte + la
 * variation en % de A vers B pour total attendu, total collecté et taux de recouvrement.
 * Une année sans barème donne un bloc `null` et des variations `null` (jamais d'erreur).
 */
export function comparerPeriodes(
  anneeA: number,
  anneeB: number,
  baremes: BaremeAnnuelInput[],
  membres: MembreRapport[],
): ComparaisonPeriodes {
  const rapportA = rapportPourAnnee(anneeA, baremes, membres)
  const rapportB = rapportPourAnnee(anneeB, baremes, membres)

  return {
    anneeA,
    anneeB,
    rapportA,
    rapportB,
    variations: {
      totalAttendu: variationPourcent(rapportA?.totalAttendu ?? null, rapportB?.totalAttendu ?? null),
      totalCollecte: variationPourcent(
        rapportA?.totalCollecte ?? null,
        rapportB?.totalCollecte ?? null,
      ),
      tauxRecouvrement: variationPourcent(
        rapportA?.tauxRecouvrement ?? null,
        rapportB?.tauxRecouvrement ?? null,
      ),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (mockable) + chargement                                     */
/* -------------------------------------------------------------------------- */

export interface RapportPrisma {
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ annee: number; montantAttendu: number }[]>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
  }
}

const SELECT_BAREME = { annee: true, montantAttendu: true } as const
const SELECT_MEMBRE_RAPPORT = {
  anneeAdhesion: true,
  anneeFinContribution: true,
  contributions: { select: { annee: true, montantValorise: true } },
} as const

/**
 * Charge les données nécessaires au rapport (barèmes + membres avec leurs contributions
 * valorisées) en deux requêtes, puis les expose aux fonctions pures ci-dessus.
 */
export async function chargerDonneesRapport(
  prisma: RapportPrisma,
): Promise<{ baremes: BaremeAnnuelInput[]; membres: MembreRapport[] }> {
  const [baremes, membres] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: SELECT_BAREME }),
    prisma.membre.findMany({ select: SELECT_MEMBRE_RAPPORT }),
  ])
  return {
    baremes,
    membres: membres.map((m) => ({
      anneeAdhesion: m.anneeAdhesion,
      anneeFinContribution: m.anneeFinContribution ?? null,
      contributions: m.contributions,
    })),
  }
}
