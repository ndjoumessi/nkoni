import type { EtatForfait, Forfait } from '@/lib/forfait'

/**
 * Règles d'AFFICHAGE de l'échéance côté console (spec 1.1 §4.2). Aucune règle de calcul ici : l'état
 * vient du serveur. Fichier séparé du composant pour le Fast Refresh (un module de composants
 * n'exporte que des composants).
 */

/** États qui appellent une relance commerciale. */
const ETATS_A_RELANCER: readonly EtatForfait[] = ['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE']

/** Organisation à relancer : forfait PAYANT enregistré, en échéance proche, en grâce ou expiré. */
export function estARelancer(o: { forfait: Forfait; etatForfait: EtatForfait }): boolean {
  return o.forfait !== 'GRATUIT' && ETATS_A_RELANCER.includes(o.etatForfait)
}

/**
 * Tri par échéance dans le sens `dir` ; les organisations sans échéance passent en dernier DANS LES DEUX
 * SENS. Le sens est porté ici plutôt que par un `reverse()` du tableau trié : inverser remonterait les
 * « sans échéance » (hors sujet pour une relance) en tête du tri décroissant.
 */
export function comparerEcheances(
  a: { forfaitExpireLe: string | null },
  b: { forfaitExpireLe: string | null },
  dir: 'asc' | 'desc' = 'asc',
): number {
  if (a.forfaitExpireLe === null && b.forfaitExpireLe === null) return 0
  if (a.forfaitExpireLe === null) return 1
  if (b.forfaitExpireLe === null) return -1
  const ecart = new Date(a.forfaitExpireLe).getTime() - new Date(b.forfaitExpireLe).getTime()
  return dir === 'desc' ? -ecart : ecart
}
