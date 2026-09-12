/**
 * Forfaits commerciaux (SaaS §3.1, spec 1.1) — MIROIR de `backend/src/lib/forfait.ts`. L'alignement est
 * VÉRIFIÉ par `forfait-parity.test.ts` : modifier la table ici sans le backend (ou l'inverse) casse le
 * test. Les LIBELLÉS sont traduits via i18n, pas ici.
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

// Unités BINAIRES, comme `TAILLE_MAX_IMAGE` (backend/src/lib/upload-image.ts).
const MO = 1024 * 1024
const GO = 1024 * MO

export interface CapacitesForfait {
  /** Plafond de membres ACTIFS. `null` = illimité. */
  limiteMembres: number | null
  /** Quota de stockage des documents. Consommé à l'étape 3 de la spec. */
  quotaStockageOctets: number
  /** Paiement en ligne Mobile Money disponible. Consommé à l'étape 3 de la spec. */
  paiementEnLigne: boolean
}

export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>> = {
  GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
  PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
}

/**
 * Plafond de membres ACTIFS — dérivé de la table. Un forfait INCONNU (API déployée avant le front)
 * renvoie `null` (illimité), comme le `default` historique : le front ne doit pas planter sur une valeur
 * d'enum qu'il ne connaît pas encore.
 */
export function limiteMembresForfait(forfait: Forfait): number | null {
  return CAPACITES_FORFAIT[forfait]?.limiteMembres ?? null
}
