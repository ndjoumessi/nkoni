import type { EtatForfait, Forfait } from '@/lib/forfait'

/**
 * Règles d'AFFICHAGE de l'échéance côté console (spec 1.1 §4.2). Aucune règle de calcul ici : l'état
 * vient du serveur. Fichier séparé du composant pour le Fast Refresh (un module de composants
 * n'exporte que des composants).
 */

/** États qui appellent une relance commerciale. */
const ETATS_A_RELANCER: readonly EtatForfait[] = ['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE']

/**
 * Organisation à relancer : forfait PAYANT enregistré, en échéance proche, en grâce ou expiré.
 * `etatForfait` tolère `undefined` (front déployé AVANT le backend, B2 : une ancienne API omet ce
 * champ) — traité comme « pas à relancer » plutôt que de planter ou de relancer à tort.
 */
export function estARelancer(o: { forfait: Forfait; etatForfait: EtatForfait | null | undefined }): boolean {
  return o.forfait !== 'GRATUIT' && o.etatForfait != null && ETATS_A_RELANCER.includes(o.etatForfait)
}

/**
 * Tri par échéance dans le sens `dir` ; les organisations sans échéance passent en dernier DANS LES DEUX
 * SENS. Le sens est porté ici plutôt que par un `reverse()` du tableau trié : inverser remonterait les
 * « sans échéance » (hors sujet pour une relance) en tête du tri décroissant. `forfaitExpireLe` tolère
 * `undefined` (B2) — traité comme `null` (sans échéance), sinon `new Date(undefined)` produirait une
 * date invalide et un comparateur incohérent.
 */
export function comparerEcheances(
  a: { forfaitExpireLe: string | null | undefined },
  b: { forfaitExpireLe: string | null | undefined },
  dir: 'asc' | 'desc' = 'asc',
): number {
  const av = a.forfaitExpireLe ?? null
  const bv = b.forfaitExpireLe ?? null
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  const ecart = new Date(av).getTime() - new Date(bv).getTime()
  return dir === 'desc' ? -ecart : ecart
}
