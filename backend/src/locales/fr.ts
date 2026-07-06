/**
 * Catalogue de messages FR (§4 i18n) — langue de référence.
 *
 * Convention de clés : `<domaine>.<message>` (ex. `auth.identifiantsInvalides`). Les valeurs
 * peuvent contenir des jetons d'interpolation `{nom}` résolus par `t()` (voir lib/i18n.ts).
 *
 * FR est la source de vérité : `CleMessage` est dérivé de ses clés, et `en.ts` DOIT implémenter
 * exactement le même ensemble (type `Messages`) → parité garantie à la compilation.
 *
 * Ce catalogue s'enrichit lot par lot (B1 auth/utilisateurs, B2 membres, …). Le Lot 0 n'y met
 * que les clés du socle (endpoint de préférence de langue).
 */
export const fr = {
  // Socle (Lot 0)
  'commun.tokenInvalide': 'Token invalide.',
  'commun.nonAutorise': 'Non autorisé.',
} as const

/** Clé de message valide (union dérivée du catalogue FR). */
export type CleMessage = keyof typeof fr

/** Forme qu'un catalogue de langue doit respecter (mêmes clés que FR). */
export type Messages = Record<CleMessage, string>
