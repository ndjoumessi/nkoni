import '@fastify/jwt' // augmentations reply.jwtSign / reply.refreshJwtSign
import { randomUUID } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import {
  env,
  isProd,
  REFRESH_TTL_STANDARD_SECONDS,
  REFRESH_TTL_REMEMBER_SECONDS,
} from './env'
import type { Role } from '../middlewares/permissions'
import type { Langue } from './i18n'
import { langueEffective, type AuthenticatedUser } from '../services/auth.service'

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
  // §4 i18n : la langue EFFECTIVE (préférence perso ↩ défaut de l'org) voyage dans le token →
  // messages serveur traduits sans requête DB (voir lib/i18n.ts `langueDeRequete`). Absente
  // uniquement pour un compte sans préférence ET sans org (SUPER_ADMIN) → repli Accept-Language.
  const langue = langueEffective(user)
  if (langue) payload.langue = langue
  return reply.jwtSign(payload)
}

/** Options de rotation (M5) : `prisma` pour persister le refresh token stateful, `familleId` pour
 *  RESTER dans la même famille lors d'une rotation (au login/inscription, on en génère une neuve). */
export interface EmettreRefreshOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma?: { refreshToken: { create(args: any): Promise<any> } }
  familleId?: string
}

/**
 * Émet une session complète : renvoie l'access token ET pose le cookie refresh httpOnly.
 * `rememberMe` n'agit QUE sur la longévité du refresh (30 j si true, 7 j sinon).
 *
 * ROTATION (M5) : le refresh porte un `jti` unique + un `familleId`. Si `opts.prisma` est fourni,
 * le token est ENREGISTRÉ (stateful) → la route de refresh peut le révoquer à la rotation et
 * détecter un replay (token déjà révoqué représenté → révocation de toute la famille).
 */
export async function emettreSession(
  reply: FastifyReply,
  user: AuthenticatedUser,
  rememberMe = false,
  opts: EmettreRefreshOptions = {},
): Promise<string> {
  const accessToken = await signAccessToken(reply, user)
  const refreshTtlSeconds = rememberMe
    ? REFRESH_TTL_REMEMBER_SECONDS
    : REFRESH_TTL_STANDARD_SECONDS

  const jti = randomUUID()
  const familleId = opts.familleId ?? randomUUID()
  const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000)
  // Persistance stateful (RefreshToken n'est PAS un modèle scopé → aucun contexte org requis).
  if (opts.prisma) {
    await opts.prisma.refreshToken.create({
      data: { jti, utilisateurId: user.id, familleId, expiresAt, revoke: false },
    })
  }

  // `epoch` : l'époque de session à l'émission (M5) — révocation au changement de mot de passe.
  // `jti`/`fam` : identité du token + sa famille (rotation/replay). `rem` : conserve le rememberMe
  // à travers les rotations (sinon un « se souvenir de moi » retomberait à 7 j au 1er refresh).
  const refreshToken = await reply.refreshJwtSign(
    { sub: user.id, typ: 'refresh', epoch: user.sessionEpoch, jti, fam: familleId, rem: rememberMe },
    { expiresIn: refreshTtlSeconds },
  )
  reply.setCookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshTtlSeconds))
  return accessToken
}
