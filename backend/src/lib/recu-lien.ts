import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env'

/**
 * Lien PUBLIC signé de téléchargement d'un reçu (partage WhatsApp `wa.me`).
 *
 * Les reçus sont privés (Blob privé + proxy authentifié). Pour permettre à un MEMBRE, souvent
 * sans compte, de télécharger SON reçu depuis un lien reçu par message, on signe l'identifiant
 * du reçu par HMAC-SHA256 (secret serveur = `JWT_ACCESS_SECRET`, déjà présent). La route
 * `GET /recus/:id/pdf-public?t=<signature>` valide cette signature au lieu du JWT.
 *
 * Propriétés de sécurité :
 *  - NON forgeable / NON énumérable : sans le secret, impossible de produire une signature valide.
 *  - LIÉE À CET id : la signature n'autorise QUE le reçu dont l'id a été signé (pas d'échange d'id).
 *  - Isolation tenant préservée en aval : la route résout l'org du reçu hors scope puis génère le
 *    PDF DANS le contexte de cette org (cf. `recus.route.ts`).
 *  - Révocable en masse : une rotation du secret invalide tous les liens émis.
 *  - Permanent (pas d'expiration) : un reçu est une archive ; choix produit assumé.
 */
const PREFIXE = 'recu-pdf-public:v1:'

/** Signature base64url liant un lien public à l'id du reçu. */
export function signerRecu(recuId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(PREFIXE + recuId).digest('base64url')
}

/** Vérifie une signature en temps constant (anti-timing). `false` si longueur ou valeur diffère. */
export function verifierSignatureRecu(recuId: string, signature: string): boolean {
  const attendue = Buffer.from(signerRecu(recuId))
  const fournie = Buffer.from(signature)
  return attendue.length === fournie.length && timingSafeEqual(attendue, fournie)
}
