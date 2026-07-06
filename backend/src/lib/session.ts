import '@fastify/jwt' // augmentations reply.jwtSign / reply.refreshJwtSign
import type { FastifyReply } from 'fastify'
import {
  env,
  isProd,
  REFRESH_TTL_STANDARD_SECONDS,
  REFRESH_TTL_REMEMBER_SECONDS,
} from './env'
import type { Role } from '../middlewares/permissions'
import type { Langue } from './i18n'
import type { AuthenticatedUser } from '../services/auth.service'

/**
 * Émission de session (access token + cookie refresh httpOnly) — factorisée pour être
 * PARTAGÉE par `/auth/login` et l'auto-inscription `/organisations/inscription` (§3.1),
 * afin que l'inscription connecte l'utilisateur exactement comme un login.
 */

/**
 * Options du cookie httpOnly qui porte le refresh token. `maxAgeSeconds` doit refléter le
 * `expiresIn` du JWT signé (même durée). SameSite=Lax : front/back same-origin via le proxy
 * Vercel (/api/* → Railway) → cookie first-party, protection CSRF conservée.
 */
function refreshCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd, // en dev (http://localhost) Secure=false pour que le cookie soit posé
    sameSite: 'lax' as const,
    path: env.REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  }
}

/** Signe l'access token (construction conditionnelle pour exactOptionalPropertyTypes). */
export async function signAccessToken(
  reply: FastifyReply,
  user: AuthenticatedUser,
): Promise<string> {
  const payload: {
    sub: string
    role: Role
    membreId?: string
    organisationId?: string
    langue?: Langue
  } = {
    sub: user.id,
    role: user.role,
  }
  if (user.membreId) payload.membreId = user.membreId
  // Porté dans l'access token → l'authenticate établit le contexte d'isolation (SaaS §2.2).
  if (user.organisationId) payload.organisationId = user.organisationId
  // §4 i18n : la préférence de langue voyage dans le token → messages serveur traduits sans
  // requête DB (voir lib/i18n.ts `langueDeRequete`). Absente si l'utilisateur ne l'a pas fixée.
  if (user.langue) payload.langue = user.langue
  return reply.jwtSign(payload)
}

/**
 * Émet une session complète : renvoie l'access token ET pose le cookie refresh httpOnly.
 * `rememberMe` n'agit QUE sur la longévité du refresh (30 j si true, 7 j sinon).
 */
export async function emettreSession(
  reply: FastifyReply,
  user: AuthenticatedUser,
  rememberMe = false,
): Promise<string> {
  const accessToken = await signAccessToken(reply, user)
  const refreshTtlSeconds = rememberMe
    ? REFRESH_TTL_REMEMBER_SECONDS
    : REFRESH_TTL_STANDARD_SECONDS
  const refreshToken = await reply.refreshJwtSign(
    { sub: user.id, typ: 'refresh' },
    { expiresIn: refreshTtlSeconds },
  )
  reply.setCookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshTtlSeconds))
  return accessToken
}
