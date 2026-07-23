import 'dotenv/config'

/**
 * Lecture + validation centralisée de la configuration d'environnement.
 * Fail-fast : si un secret obligatoire manque, l'app refuse de démarrer.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    throw new Error(`[env] Variable d'environnement obligatoire manquante : ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

/** Entier positif depuis l'env, avec repli si absent/illisible. */
function optionalInt(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const jwtAccessSecret = required('JWT_ACCESS_SECRET')

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  // Secrets JWT — distincts pour access et refresh.
  JWT_ACCESS_SECRET: jwtAccessSecret,
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  // Secret DÉDIÉ à la signature des liens publics de reçus (§4.6). Optionnel : repli sur
  // JWT_ACCESS_SECRET si absent (rien ne casse, aucune migration). Un secret dédié permet de
  // RÉVOQUER les liens de reçus (en le tournant) SANS invalider les sessions JWT. À poser sur
  // Railway : RECU_LINK_SECRET (recommandé, non obligatoire).
  RECU_LINK_SECRET: optional('RECU_LINK_SECRET', jwtAccessSecret),
  // Durées de vie (format @fastify/jwt / ms, ex. "15m", "30d").
  JWT_ACCESS_TTL: optional('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: optional('JWT_REFRESH_TTL', '30d'),
  // CORS — origine whitelistée du frontend (dev Vite).
  CORS_ORIGIN: optional('CORS_ORIGIN', 'http://localhost:5173'),
  // Nom du cookie httpOnly qui porte le refresh token.
  REFRESH_COOKIE_NAME: optional('REFRESH_COOKIE_NAME', 'nkoni_refresh'),
  // Token Vercel Blob (stockage des documents §5). Optionnel au démarrage : seuls les
  // upload/suppression de documents en ont besoin (@vercel/blob le lit aussi via l'env).
  // À définir sur Railway : BLOB_READ_WRITE_TOKEN.
  BLOB_READ_WRITE_TOKEN: optional('BLOB_READ_WRITE_TOKEN', ''),
  // Clé maître de CHIFFREMENT des identifiants PSP par organisation (§ paiement) — AES-256-GCM,
  // 32 octets encodés en base64 (44 car.) ou hex (64 car.). Sans elle, aucune config de paiement ne
  // peut être (dé)chiffrée : la config paiement est simplement indisponible. À poser sur Railway :
  // PSP_ENCRYPTION_KEY (générer p.ex. `openssl rand -base64 32`).
  PSP_ENCRYPTION_KEY: optional('PSP_ENCRYPTION_KEY', ''),
  // Chemin (attribut Path) du cookie refresh. Doit refléter le chemin PUBLIC vu par le
  // navigateur, qui n'est pas forcément le chemin interne du back.
  //   - Dev / appel direct : '/auth' (le front tape http://localhost:3000/auth/*).
  //   - Prod derrière le proxy same-origin Vercel : le front tape /api/auth/* sur
  //     nkoni.vercel.app (rewrite → Railway). Le cookie devient first-party sur
  //     nkoni.vercel.app, donc son Path doit être '/api/auth' pour être renvoyé aux
  //     requêtes /api/auth/refresh et /api/auth/logout. → REFRESH_COOKIE_PATH=/api/auth
  REFRESH_COOKIE_PATH: optional('REFRESH_COOKIE_PATH', '/auth'),
  // Origine PUBLIQUE de l'app (front same-origin) — sert à construire l'URL absolue encodée dans le
  // QR des cartes de membre (§4.7) : `${PUBLIC_BASE_URL}/api/membres/:id/statut-public?t=…`. Défaut
  // prod ; à surcharger seulement si le domaine public change. À poser sur Railway si besoin.
  PUBLIC_BASE_URL: optional('PUBLIC_BASE_URL', 'https://nkoni.vercel.app'),
  // Montant MINIMUM d'un paiement en ligne (§ paiement), en XAF. Défaut 100 (plancher raisonnable en
  // production). Rendu configurable pour le TEST : le bac à sable CamPay plafonne à 25 XAF, donc pour
  // dérouler un paiement demo de bout en bout on abaisse ce plancher (ex. PAIEMENT_MONTANT_MIN=5) —
  // à remettre à 100 (ou retirer) une fois les tests demo faits.
  PAIEMENT_MONTANT_MIN: optionalInt('PAIEMENT_MONTANT_MIN', 100),
} as const

export const isProd = env.NODE_ENV === 'production'

// Avertissements de configuration en PRODUCTION (NON bloquants — le fail-fast reste réservé aux
// secrets obligatoires). Surfacent les DÉFAUTS risqués quand une variable n'a pas été posée sur
// Railway, plutôt que de les laisser s'appliquer en silence (audit W1). Muet hors production.
if (isProd) {
  const avertir = (msg: string): void => console.warn(`[env] ⚠️  ${msg}`)
  if (!process.env['CORS_ORIGIN']) {
    avertir(
      "CORS_ORIGIN non défini → défaut 'http://localhost:5173' : le front de production sera refusé en cross-origin. Posez CORS_ORIGIN sur Railway.",
    )
  }
  if (!process.env['RECU_LINK_SECRET']) {
    avertir(
      'RECU_LINK_SECRET non défini → repli sur JWT_ACCESS_SECRET : impossible de révoquer les liens publics de reçus sans invalider toutes les sessions. Posez un secret dédié sur Railway.',
    )
  }
  if (!process.env['BLOB_READ_WRITE_TOKEN']) {
    avertir(
      "BLOB_READ_WRITE_TOKEN non défini → l'upload/téléchargement de documents, photos et reçus échouera. Posez-le sur Railway.",
    )
  }
  if (!process.env['SENTRY_DSN']) {
    avertir(
      "SENTRY_DSN non défini → aucune erreur n'est remontée (5xx, échec d'audit, échec du scheduler nocturne) : une panne passera inaperçue jusqu'à ce qu'un client la signale. Posez-le sur Railway (bloquant GA 0.1).",
    )
  }
  if (!process.env['PSP_ENCRYPTION_KEY']) {
    avertir(
      'PSP_ENCRYPTION_KEY non défini → la configuration de paiement en ligne (§ paiement) sera indisponible : les identifiants PSP ne peuvent être ni chiffrés ni déchiffrés. Posez une clé 32 octets sur Railway.',
    )
  }
  // Canal de notification (§4.6, bloquant GA 0.4) : reçus et relances partent par WhatsApp d'abord,
  // email (Resend) en repli. Si AUCUN des deux n'est configuré, rien ne part — le plus utile est
  // de le signaler d'un bloc plutôt que canal par canal (l'un OU l'autre suffit).
  const whatsappConfig = process.env['WHATSAPP_TOKEN'] && process.env['WHATSAPP_PHONE_ID']
  const resendConfig = process.env['RESEND_API_KEY'] && process.env['RESEND_FROM']
  if (!whatsappConfig && !resendConfig) {
    avertir(
      'Aucun canal de notification configuré (ni WhatsApp WHATSAPP_TOKEN/WHATSAPP_PHONE_ID, ni email RESEND_API_KEY/RESEND_FROM) → les reçus et relances ne partiront pas. Posez au moins un canal sur Railway (bloquant GA 0.4).',
    )
  }
}

const DAY_SECONDS = 60 * 60 * 24

/**
 * Durées de vie du refresh token, en SECONDES. Elles pilotent à la fois le `expiresIn`
 * du JWT refresh signé ET le `Max-Age` du cookie httpOnly — les deux DOIVENT rester
 * synchronisés, d'où cette source unique.
 *
 * Deux paliers, choisis au login selon la case « Se souvenir de moi » (cf. auth.route.ts) :
 *   - STANDARD : case décochée, session « classique » (7 jours).
 *   - REMEMBER : case cochée, « reste connecté plus longtemps sur cet appareil » (30 jours).
 */
export const REFRESH_TTL_STANDARD_SECONDS = 7 * DAY_SECONDS
export const REFRESH_TTL_REMEMBER_SECONDS = 30 * DAY_SECONDS
