/**
 * Forfaits commerciaux (SaaS §3.1) — MIROIR de `backend/src/lib/forfait.ts` (garder alignés).
 * Palier qui borne le nombre de membres ACTIFS d'une organisation. L'attribution est réservée
 * au SUPER_ADMIN (console plateforme). Les LIBELLÉS sont traduits via i18n, pas ici.
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

/** Plafond de membres ACTIFS par forfait. `null` = illimité (Pro & Entreprise). */
export function limiteMembresForfait(forfait: Forfait): number | null {
  switch (forfait) {
    case 'GRATUIT':
      return 50
    default:
      return null
  }
}
