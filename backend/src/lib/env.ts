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

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  // Secrets JWT — distincts pour access et refresh.
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  // Durées de vie (format @fastify/jwt / ms, ex. "15m", "30d").
  JWT_ACCESS_TTL: optional('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: optional('JWT_REFRESH_TTL', '30d'),
  // CORS — origine whitelistée du frontend (dev Vite).
  CORS_ORIGIN: optional('CORS_ORIGIN', 'http://localhost:5173'),
  // Nom du cookie httpOnly qui porte le refresh token.
  REFRESH_COOKIE_NAME: optional('REFRESH_COOKIE_NAME', 'nkoni_refresh'),
  // Chemin (attribut Path) du cookie refresh. Doit refléter le chemin PUBLIC vu par le
  // navigateur, qui n'est pas forcément le chemin interne du back.
  //   - Dev / appel direct : '/auth' (le front tape http://localhost:3000/auth/*).
  //   - Prod derrière le proxy same-origin Vercel : le front tape /api/auth/* sur
  //     nkoni.vercel.app (rewrite → Railway). Le cookie devient first-party sur
  //     nkoni.vercel.app, donc son Path doit être '/api/auth' pour être renvoyé aux
  //     requêtes /api/auth/refresh et /api/auth/logout. → REFRESH_COOKIE_PATH=/api/auth
  REFRESH_COOKIE_PATH: optional('REFRESH_COOKIE_PATH', '/auth'),
} as const

export const isProd = env.NODE_ENV === 'production'

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
