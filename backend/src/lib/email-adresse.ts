/**
 * Normalisation d'une adresse email de CONTACT (§4.6, canal de repli). Même philosophie que
 * `lib/telephone.ts` : renvoie `null` si l'adresse ne peut pas être retenue de façon fiable →
 * l'appelant n'envoie PAS (mieux vaut ne rien envoyer qu'envoyer à une adresse douteuse).
 *
 * Volontairement PERMISSIF mais pas laxiste : trim + minuscule + une forme `local@domaine.tld`
 * plausible (un seul « @ », un point dans le domaine, aucun espace). On ne cherche pas à valider
 * l'existence de la boîte — seulement à écarter les saisies manifestement invalides.
 */

// Un « @ » unique, une partie locale et un domaine non vides, au moins un point dans le domaine,
// aucun espace nulle part. Suffisant pour écarter le bruit sans rejeter d'adresses légitimes.
const FORME_PLAUSIBLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliserEmail(brut: string | null | undefined): string | null {
  if (!brut) return null
  const nettoye = brut.trim().toLowerCase()
  if (!nettoye) return null
  return FORME_PLAUSIBLE.test(nettoye) ? nettoye : null
}
