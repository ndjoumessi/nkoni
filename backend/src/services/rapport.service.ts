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

/**
 * Variation d'une métrique entre deux périodes :
 *  - `number` = pourcentage de variation (positif/négatif) ;
 *  - `'nouveau'` = APPARITION (base à 0 → valeur positive) : un % serait infini/trompeur, mais
 *    c'est une info réelle (la métrique passe de rien à quelque chose) — distinct de « n/a » ;
 *  - `0` inclut le cas « resté à zéro » (0 → 0 = pas de variation) ;
 *  - `null` = incomparable → rendu « n/a » (réservé aux années SANS barème).
 */
export type Variation = number | 'nouveau' | null

export interface VariationsComparaison {
  totalAttendu: Variation
  totalCollecte: Variation
  tauxRecouvrement: Variation
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
 * Variation de `depuis` vers `vers`. `null` UNIQUEMENT si une valeur est absente (année sans
 * barème → vraiment incomparable, rendu « n/a »). Base 0 → valeur POSITIVE = `'nouveau'`
 * (apparition, cf. type `Variation`). Base 0 → 0 = `0` (resté à zéro = pas de variation, pas
 * « n/a »). Sinon, % signé (positif = progression).
 */
export function variationPourcent(depuis: number | null, vers: number | null): Variation {
  if (depuis === null || vers === null) return null
  if (depuis === 0) return vers > 0 ? 'nouveau' : 0
  return arrondi2(((vers - depuis) / depuis) * 100)
}

/**
 * Compare deux années (fonction PURE) : renvoie les deux blocs annuels côte à côte + la
 * variation en % de A vers B pour total attendu, total collecté et taux de recouvrement.
 * Une année sans barème donne un bloc `null` et des variations `null` (jamais d'erreur).
 */
/**
 * Variations en % de `avant` vers `apres` pour chaque métrique comparable. Fonction
 * partagée par la comparaison de paire et la comparaison multi-années (une seule
 * définition du calcul de %).
 */
export function variationsEntre(
  avant: RapportAnnee | null,
  apres: RapportAnnee | null,
): VariationsComparaison {
  return {
    totalAttendu: variationPourcent(avant?.totalAttendu ?? null, apres?.totalAttendu ?? null),
    totalCollecte: variationPourcent(avant?.totalCollecte ?? null, apres?.totalCollecte ?? null),
    tauxRecouvrement: variationPourcent(
      avant?.tauxRecouvrement ?? null,
      apres?.tauxRecouvrement ?? null,
    ),
  }
}

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
    variations: variationsEntre(rapportA, rapportB),
  }
}

/* -------------------------------------------------------------------------- */
/* Comparaison multi-années (chaîne : chaque année vs la précédente de la liste) */
/* -------------------------------------------------------------------------- */

export interface AnneeComparee {
  annee: number
  /** null si l'année n'a pas de barème configuré (ignorée). */
  rapport: RapportAnnee | null
  /**
   * Variation vs l'année PRÉCÉDENTE DANS LA LISTE (pas l'année civile précédente).
   * null pour la première année de la liste (aucune référence).
   */
  variations: VariationsComparaison | null
}

export interface ComparaisonMulti {
  annees: AnneeComparee[]
}

/**
 * Compare N années « en chaîne » (fonction PURE) : chaque année à partir de la 2e est
 * comparée à l'année qui la précède DANS LA LISTE fournie — pas nécessairement l'année
 * civile précédente (les années peuvent être non contiguës, ex. 2020, 2023, 2024).
 *
 * Réutilise `rapportPourAnnee` (donc `calculerStatutContribution`) et `variationsEntre`
 * (même calcul de % que `comparerPeriodes`). Une année sans barème → rapport `null` et
 * variations `null` de part et d'autre, sans erreur. L'ordre de la liste est conservé tel
 * quel (le frontend décide de l'ordre ; le service ne re-trie pas).
 */
export function comparerPeriodesMulti(
  annees: number[],
  baremes: BaremeAnnuelInput[],
  membres: MembreRapport[],
): ComparaisonMulti {
  const items: AnneeComparee[] = []
  let precedent: RapportAnnee | null = null

  annees.forEach((annee, index) => {
    const rapport = rapportPourAnnee(annee, baremes, membres)
    // 1re année de la liste : aucune référence → pas de variation.
    const variations = index === 0 ? null : variationsEntre(precedent, rapport)
    items.push({ annee, rapport, variations })
    precedent = rapport
  })

  return { annees: items }
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
