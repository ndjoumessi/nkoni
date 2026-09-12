/**
 * Forfaits commerciaux (SaaS §3.1, spec 1.1) — SOURCE UNIQUE des capacités par forfait (routes +
 * services + tests). Miroir côté front dans `frontend/src/lib/forfait.ts`, dont l'alignement est vérifié
 * par `frontend/src/lib/forfait-parity.test.ts` (lecture en texte des deux fichiers).
 *
 * L'attribution d'un forfait est une action PLATEFORME réservée au SUPER_ADMIN (activation manuelle
 * depuis la console, pas de paiement en ligne à ce stade).
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

// Unités BINAIRES, comme `TAILLE_MAX_IMAGE` (lib/upload-image.ts).
const MO = 1024 * 1024
const GO = 1024 * MO

export interface CapacitesForfait {
  /** Plafond de membres ACTIFS. `null` = illimité. */
  limiteMembres: number | null
  /** Quota de stockage des documents (Σ `Document.tailleOctets`). Consommé à l'étape 3 de la spec. */
  quotaStockageOctets: number
  /** Paiement en ligne Mobile Money disponible. Consommé à l'étape 3 de la spec. */
  paiementEnLigne: boolean
}

/**
 * Capacités par forfait. Modifier UNIQUEMENT ici (+ le miroir front, sinon le garde de parité casse).
 * Ne vendre ni la transparence envers les membres, ni rien de ce qu'ils voient (spec §1.1).
 */
export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>> = {
  GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
  PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
}

/** Plafond de membres ACTIFS du forfait — DÉRIVÉ de `CAPACITES_FORFAIT` (appelants inchangés). */
export function limiteMembresForfait(forfait: Forfait): number | null {
  return CAPACITES_FORFAIT[forfait].limiteMembres
}
