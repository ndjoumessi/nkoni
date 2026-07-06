/**
 * Catalogue de messages EN (§4 i18n). Typé `Messages` → le compilateur exige EXACTEMENT
 * les mêmes clés que `fr.ts` (parité garantie ; une clé oubliée = erreur de build).
 */
import type { Messages } from './fr'

export const en: Messages = {
  // Socle (Lot 0)
  'commun.tokenInvalide': 'Invalid token.',
  'commun.nonAutorise': 'Not authorized.',
}
