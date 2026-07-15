/**
 * Forfaits commerciaux (SaaS §3.1) — palier qui borne le nombre de membres ACTIFS d'une
 * organisation. Source de vérité PARTAGÉE (routes + services + tests). Miroir côté front dans
 * `frontend/src/lib/forfait.ts` (garder les deux alignés).
 *
 * L'attribution d'un forfait est une action PLATEFORME réservée au SUPER_ADMIN (activation
 * manuelle depuis la console, pas de paiement en ligne à ce stade).
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

/**
 * Plafond de membres ACTIFS par forfait. `null` = ILLIMITÉ (Pro & Entreprise) : aucun quota
 * n'est appliqué. Seul le forfait Gratuit est borné (50). Modifier UNIQUEMENT ici (+ le miroir
 * front) pour changer les paliers.
 */
export function limiteMembresForfait(forfait: Forfait): number | null {
  switch (forfait) {
    case 'GRATUIT':
      return 50
    case 'PRO':
    case 'ENTREPRISE':
      return null
  }
}
