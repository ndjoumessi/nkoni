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
