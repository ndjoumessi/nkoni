/**
 * Amendes / pénalités (§4.10) — logique métier PURE (aucun accès Prisma, testable sans DB).
 *
 * Une amende sanctionne un membre (retard de cotisation, absence à une réunion, autre). Cycle :
 *
 *   IMPAYEE → PAYEE      (encaissement)
 *   IMPAYEE → ANNULEE    (amende levée / erreur de saisie)
 *
 * On n'édite/supprime plus une amende qui n'est plus IMPAYEE (elle est réglée ou annulée). Une
 * amende ANNULEE ne compte NI dans le dû NI dans l'encaissé. Poche de suivi séparée : les
 * montants ne sont PAS (encore) injectés dans le solde de trésorerie générale.
 */

export type TypeAmendeValue = 'RETARD_COTISATION' | 'ABSENCE_REUNION' | 'AUTRE'
export type StatutAmendeValue = 'IMPAYEE' | 'PAYEE' | 'ANNULEE'

export const TYPES_AMENDE: readonly TypeAmendeValue[] = ['RETARD_COTISATION', 'ABSENCE_REUNION', 'AUTRE']

/** Une amende n'est éditable/supprimable que tant qu'elle est IMPAYEE. */
export function estEditableAmende(statut: StatutAmendeValue): boolean {
  return statut === 'IMPAYEE'
}

/** Transitions de statut autorisées (depuis IMPAYEE uniquement). */
const TRANSITIONS: Record<StatutAmendeValue, StatutAmendeValue[]> = {
  IMPAYEE: ['PAYEE', 'ANNULEE'],
  PAYEE: [],
  ANNULEE: [],
}

/** Levée quand on édite/supprime une amende qui n'est plus IMPAYEE. */
export class AmendeNonEditableError extends Error {
  constructor(public readonly statut: StatutAmendeValue) {
    super(`Amende ${statut} : non modifiable (seule une amende IMPAYEE l'est).`)
    this.name = 'AmendeNonEditableError'
  }
}

/** Levée sur une transition de statut non autorisée. */
export class TransitionAmendeInvalideError extends Error {
  constructor(
    public readonly de: StatutAmendeValue,
    public readonly vers: StatutAmendeValue,
  ) {
    super(`Transition d'amende invalide : ${de} → ${vers}.`)
    this.name = 'TransitionAmendeInvalideError'
  }
}

/** Valide une transition IMPAYEE→PAYEE|ANNULEE ; lève sinon. */
export function validerTransitionAmende(de: StatutAmendeValue, vers: StatutAmendeValue): void {
  if (!TRANSITIONS[de].includes(vers)) throw new TransitionAmendeInvalideError(de, vers)
}

/**
 * Totaux d'un ensemble d'amendes : dû (Σ IMPAYEE), encaissé (Σ PAYEE). Les ANNULEE sont exclues.
 */
export function totauxAmendes(amendes: { montant: number; statut: StatutAmendeValue }[]): {
  du: number
  encaisse: number
} {
  let du = 0
  let encaisse = 0
  for (const a of amendes) {
    if (a.statut === 'IMPAYEE') du += a.montant
    else if (a.statut === 'PAYEE') encaisse += a.montant
  }
  return { du, encaisse }
}
