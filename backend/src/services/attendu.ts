/**
 * « COMBIEN CE MEMBRE DOIT-IL ? » — un seul module répond (ADR-0002).
 *
 * La question avait DEUX vérités stockées et QUATRE lectures :
 *
 *   - `BaremeAnnuel.montantAttendu` — VIVANT, éditable à tout moment ;
 *   - `Contribution.montantAttendu` — FIGÉ à l'ouverture de l'année pour ce membre.
 *
 * Le statut du membre et le taux de recouvrement des rapports lisaient le barème vivant ; le
 * plafond de paiement et l'export Excel lisaient le snapshot. Éditer un barème produisait donc
 * trois nombres différents pour le même membre, et aucun module ne possédait l'écart.
 *
 * **DÉCISION PRODUIT (PO, 2026-09-23) : l'HISTORISATION prime.** Le montant figé à l'ouverture
 * fait foi ; le barème ne vaut que pour ce qui reste à ouvrir. C'est le seul choix qui ne fasse
 * jamais bouger une somme déjà communiquée à un membre — corriger un barème ne doit pas rendre
 * « en retard », du jour au lendemain, quelqu'un qui était à jour.
 *
 * D'où la règle, en une phrase : **pour chaque année de la fenêtre, le snapshot s'il existe, le
 * barème sinon.** Une année sans `Contribution` n'a rien de figé — c'est une année attendue mais
 * pas encore ouverte, et c'est le barème courant qui dit ce qu'elle vaudra.
 */

/** Barème annuel global (montant attendu uniforme pour l'année). */
export interface BaremeAnnuelInput {
  annee: number
  montantAttendu: number
}

/**
 * Contribution du membre pour une année.
 *
 * `montantAttendu` est le SNAPSHOT figé à l'ouverture. Optionnel dans le type, parce que son
 * absence a un sens : une année attendue dont la contribution n'est pas encore ouverte n'a rien de
 * figé, et c'est le barème courant qui dit ce qu'elle vaut.
 *
 * **En base, il n'est JAMAIS absent** (colonne NOT NULL, copiée à l'ouverture) : le seul moyen de
 * le perdre est un `select` Prisma qui l'omet — ce qui ferait retomber le calcul sur le barème en
 * silence, avec un montant plausible et faux. Ce risque-là est purement côté requête, et c'est un
 * garde TEXTUEL qui le ferme (`tests/attendu-select.test.ts`), pas le typage : plusieurs services
 * passent un client Prisma typé `any`, où le compilateur ne verrait rien.
 */
export interface ContributionInput {
  annee: number
  montantAttendu?: number | undefined
  montantValorise: number
}

export interface FenetreParams {
  /** Année à partir de laquelle la contribution est attendue. */
  anneeAdhesion: number
  /** Année de fin de contribution (DECEDE/INACTIF). Absente ⇒ jusqu'à `anneeCourante`. */
  anneeFinContribution?: number | null | undefined
  /** Année de référence du calcul. */
  anneeCourante: number
}

/**
 * Fenêtre d'éligibilité `[anneeAdhesion .. borneFin]`, avec `borneFin` bornée par l'année
 * courante. C'était la règle recopiée dans quatre modules et maintenue par commentaire
 * (« miroir exact de l'attendu cumulé »).
 */
export function dansLaFenetre(annee: number, p: FenetreParams): boolean {
  const borneFin = Math.min(p.anneeCourante, p.anneeFinContribution ?? p.anneeCourante)
  return annee >= p.anneeAdhesion && annee <= borneFin
}

export interface AttenduParams extends FenetreParams {
  baremes: BaremeAnnuelInput[]
  contributions: ContributionInput[]
}

/**
 * Montant attendu d'UNE année : le snapshot de la contribution si elle existe, sinon le barème.
 * `undefined` si ni l'un ni l'autre (année jamais configurée — elle ne compte pas dans l'attendu).
 */
export function attenduDeLAnnee(
  annee: number,
  baremes: BaremeAnnuelInput[],
  contributions: ContributionInput[],
): number | undefined {
  const contribution = contributions.find((c) => c.annee === annee)
  if (typeof contribution?.montantAttendu === 'number') return contribution.montantAttendu
  const bareme = baremes.find((b) => b.annee === annee)
  return bareme?.montantAttendu
}

/**
 * Total attendu sur la fenêtre d'éligibilité.
 *
 * Parcourt l'union des années connues (barèmes ∪ contributions) : une année ouverte pour ce membre
 * compte même si son barème a depuis été supprimé, et une année barémée compte même si elle n'a
 * pas encore été ouverte pour lui.
 */
export function attenduCumule(p: AttenduParams): number {
  const annees = new Set<number>([
    ...p.baremes.map((b) => b.annee),
    ...p.contributions.map((c) => c.annee),
  ])
  let total = 0
  for (const annee of annees) {
    if (!dansLaFenetre(annee, p)) continue
    total += attenduDeLAnnee(annee, p.baremes, p.contributions) ?? 0
  }
  return total
}

/** Somme des montants VALORISÉS sur la même fenêtre — pendant du précédent. */
export function valoriseCumule(p: AttenduParams): number {
  return p.contributions
    .filter((c) => dansLaFenetre(c.annee, p))
    .reduce((somme, c) => somme + c.montantValorise, 0)
}
