/**
 * Cagnottes d'événement (§4.9) — logique métier PURE (aucun accès Prisma, testable sans DB).
 *
 * Une cagnotte est une POCHE SÉPARÉE de la caisse générale : les membres y versent des dons,
 * puis le montant collecté est reversé au bénéficiaire. On ne mélange jamais ces flux avec la
 * trésorerie de l'association (Σ versements − dépenses).
 *
 *   collecte = Σ DonCagnotte.montant
 *   solde    = collecte − montantReverse           (ce qu'il reste en caisse cagnotte)
 *   progression = objectif ? min(100, round(collecte/objectif·100)) : null
 *
 * Cycle de vie : OUVERTE → CLOTUREE. On n'édite plus (dons/paramètres) une cagnotte CLÔTURÉE
 * (elle peut être rouverte explicitement). Le reversement est borné à [0, collecte].
 */

export type TypeCagnotteValue = 'DEUIL' | 'MARIAGE' | 'NAISSANCE' | 'AUTRE'
export type StatutCagnotteValue = 'OUVERTE' | 'CLOTUREE'

export const TYPES_CAGNOTTE: readonly TypeCagnotteValue[] = ['DEUIL', 'MARIAGE', 'NAISSANCE', 'AUTRE']

/** Total collecté = somme des montants des dons. */
export function collecteCagnotte(dons: { montant: number }[]): number {
  return dons.reduce((s, d) => s + d.montant, 0)
}

/** Solde restant en caisse cagnotte = collecté − déjà reversé (jamais négatif à l'affichage). */
export function soldeCagnotte(collecte: number, montantReverse: number): number {
  return Math.max(0, collecte - montantReverse)
}

/**
 * Progression vers l'objectif, en pourcentage entier borné à 100. `null` si aucun objectif
 * chiffré (barre de progression masquée côté UI).
 */
export function progressionCagnotte(collecte: number, objectif?: number | null): number | null {
  if (!objectif || objectif <= 0) return null
  return Math.min(100, Math.round((collecte / objectif) * 100))
}

/** Une cagnotte n'est modifiable (ajout de don, édition) que tant qu'elle est OUVERTE. */
export function estEditableCagnotte(statut: StatutCagnotteValue): boolean {
  return statut === 'OUVERTE'
}

/** Levée quand on tente d'écrire (don/édition) sur une cagnotte CLÔTURÉE. */
export class CagnotteClotureeError extends Error {
  constructor() {
    super('Cagnotte clôturée : aucune modification possible (rouvrir d’abord).')
    this.name = 'CagnotteClotureeError'
  }
}

/** Levée quand le montant reversé est hors bornes [0, collecte]. */
export class ReversementInvalideError extends Error {
  constructor(
    public readonly montantReverse: number,
    public readonly collecte: number,
  ) {
    super(`Reversement invalide : ${montantReverse} hors de [0, ${collecte}].`)
    this.name = 'ReversementInvalideError'
  }
}

/**
 * Valide un montant de reversement au bénéficiaire : entier ≥ 0 et ≤ collecté (on ne peut pas
 * reverser plus que ce qui a été donné). Lève `ReversementInvalideError` sinon.
 */
export function validerReversement(montantReverse: number, collecte: number): void {
  if (!Number.isFinite(montantReverse) || montantReverse < 0 || montantReverse > collecte) {
    throw new ReversementInvalideError(montantReverse, collecte)
  }
}
