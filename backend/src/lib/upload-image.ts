import { signatureCoherente } from '../services/document.service'

/**
 * Validation d'une IMAGE téléversée (photo de membre) — logique PARTAGÉE par la route bureau
 * (`/membres/:id/photo`) et la route self-service (`/moi/photo`). Réunir les deux vérités critiques
 * en UN point testé empêche qu'un resserrement futur (nouveau MIME accepté, plafond abaissé) diverge
 * d'un côté sans casser un test :
 *   (1) le MIME doit être dans l'allowlist ET les MAGIC BYTES doivent le confirmer — le Content-Type
 *       déclaré est falsifiable, c'est ce contrôle qui empêche un fichier arbitraire de passer ;
 *   (2) la taille est bornée.
 *
 * i18n-AGNOSTIQUE (comme les services) : renvoie un CODE de refus, la route le mappe à un message.
 */

export const MIMES_IMAGE = ['image/jpeg', 'image/png'] as const
export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024 // 5 Mo

export type ErreurImage = 'TYPE_INVALIDE' | 'TROP_VOLUMINEUX'

/** `null` si l'image est acceptable, sinon le code du refus. Ordre : type (MIME + magic bytes) puis taille. */
export function validerImageTeleversee(fichier: { buffer: Buffer; mimetype: string }): ErreurImage | null {
  if (!(MIMES_IMAGE as readonly string[]).includes(fichier.mimetype)) return 'TYPE_INVALIDE'
  // Magic bytes : le Content-Type est falsifiable — on exige la vraie signature du fichier.
  if (!signatureCoherente(fichier.buffer, fichier.mimetype)) return 'TYPE_INVALIDE'
  if (fichier.buffer.length > TAILLE_MAX_IMAGE) return 'TROP_VOLUMINEUX'
  return null
}
