import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from 'fastify'
import {
  env,
  isProd,
  REFRESH_TTL_STANDARD_SECONDS,
  REFRESH_TTL_REMEMBER_SECONDS,
} from '../lib/env'
import { authenticate } from '../middlewares/authenticate'
import type { Role } from '../middlewares/permissions'
import {
  verifyCredentials,
  findUserById,
  changerMotDePasse,
  AncienMotDePasseIncorrectError,
  type AuthenticatedUser,
} from '../services/auth.service'

/**
 * Module d'authentification (§4.5) :
 *   POST /auth/login    → 200 { accessToken, user } + Set-Cookie refresh (httpOnly)
 *   POST /auth/refresh  → 200 { accessToken } (refresh lu depuis le cookie)
 *   POST /auth/logout   → 204 (efface le cookie refresh)
 *   GET  /auth/me       → 200 { id, email, role, membreId } (Bearer access)
 *
 * Refresh STATELESS (pas de model Session en MVP). Axe de durcissement V1.1/V2 :
 * rotation des refresh tokens + model `Session` stateful (révocation ciblée,
 * « logout partout »). Non implémenté ici, volontairement.
 */

const loginBodySchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 254 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
      // « Se souvenir de moi » : optionnel. Absent/false → session standard (7 j) ;
      // true → session longue (30 j). Ne concerne QUE la durée du refresh token, jamais
      // le mot de passe (voir le front : le mot de passe n'est stocké nulle part).
      rememberMe: { type: 'boolean' },
    },
  },
} as const

interface LoginBody {
  email: string
  password: string
  rememberMe?: boolean
}

const changerMdpBodySchema = {
  body: {
    type: 'object',
    required: ['ancienMotDePasse', 'nouveauMotDePasse'],
    additionalProperties: false,
    properties: {
      ancienMotDePasse: { type: 'string', minLength: 1, maxLength: 200 },
      // minLength 8 aligné sur la création de compte (utilisateurs.route.ts).
      nouveauMotDePasse: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
} as const

interface ChangerMdpBody {
  ancienMotDePasse: string
  nouveauMotDePasse: string
}

/**
 * Options du cookie httpOnly qui porte le refresh token.
 * `maxAgeSeconds` doit refléter le `expiresIn` du JWT signé (même durée) — cf. login.
 */
function refreshCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd, // en dev (http://localhost) Secure=false pour que le cookie soit posé
    // Front (nkoni.vercel.app) et back sont désormais same-origin en prod grâce au proxy
    // Vercel (rewrite /api/* → Railway) : le navigateur ne voit qu'un seul domaine et le
    // cookie refresh est first-party. On n'a donc plus besoin de SameSite=None : on passe en
    // SameSite=Lax, qui apporte une protection CSRF (le cookie n'est pas envoyé sur les
    // requêtes cross-site) tout en restant envoyé sur nos appels same-origin /api/auth/*.
    sameSite: 'lax' as const,
    // Path PUBLIC vu par le navigateur (cf. REFRESH_COOKIE_PATH) : '/auth' en direct,
    // '/api/auth' derrière le proxy prod. Doit préfixer /(api/)auth/refresh et /logout.
    path: env.REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  }
}

/** Signe l'access token (construction conditionnelle pour exactOptionalPropertyTypes). */
async function signAccessToken(
  reply: FastifyReply,
  user: AuthenticatedUser,
): Promise<string> {
  const payload: { sub: string; role: Role; membreId?: string } = {
    sub: user.id,
    role: user.role,
  }
  if (user.membreId) payload.membreId = user.membreId
  return reply.jwtSign(payload)
}

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /auth/login
  app.post<{ Body: LoginBody }>(
    '/login',
    { schema: loginBodySchema },
    async (req, reply) => {
      const { email, password, rememberMe } = req.body
      const user = await verifyCredentials(app.prisma, email, password)
      if (!user) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Identifiants invalides.' })
      }
      if (!user.actif) {
        return reply
          .code(403)
          .send({ error: 'Forbidden', message: 'Compte désactivé.' })
      }

      const accessToken = await signAccessToken(reply, user)
      // « Se souvenir de moi » n'agit QUE sur la longévité de la session (durée du refresh
      // token + Max-Age du cookie) : 30 j si coché, 7 j sinon. On surcharge le `expiresIn`
      // par requête et on aligne le Max-Age du cookie sur cette même durée.
      const refreshTtlSeconds = rememberMe
        ? REFRESH_TTL_REMEMBER_SECONDS
        : REFRESH_TTL_STANDARD_SECONDS
      const refreshToken = await reply.refreshJwtSign(
        { sub: user.id, typ: 'refresh' },
        { expiresIn: refreshTtlSeconds },
      )
      reply.setCookie(
        env.REFRESH_COOKIE_NAME,
        refreshToken,
        refreshCookieOptions(refreshTtlSeconds),
      )

      return reply.code(200).send({
        accessToken,
        user: { id: user.id, email: user.email, role: user.role },
      })
    },
  )

  // POST /auth/refresh — lit le refresh depuis le cookie httpOnly, réémet un access token.
  app.post('/refresh', async (req, reply) => {
    try {
      const payload = await req.refreshJwtVerify<{ sub?: string; typ?: string }>()
      if (payload.typ !== 'refresh' || !payload.sub) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Refresh token invalide.' })
      }

      const user = await findUserById(app.prisma, payload.sub)
      if (!user || !user.actif) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Session invalide.' })
      }

      const accessToken = await signAccessToken(reply, user)
      return reply.code(200).send({ accessToken })
    } catch {
      return reply
        .code(401)
        .send({ error: 'Unauthorized', message: 'Refresh token absent ou invalide.' })
    }
  })

  // POST /auth/logout — efface le cookie refresh (côté client, tokens à jeter).
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(env.REFRESH_COOKIE_NAME, { path: env.REFRESH_COOKIE_PATH })
    return reply.code(204).send()
  })

  // GET /auth/me — profil de l'utilisateur authentifié (Bearer access).
  app.get('/me', { preHandler: [authenticate] }, async (req, reply) => {
    const sub = req.user.sub
    if (!sub) {
      return reply
        .code(401)
        .send({ error: 'Unauthorized', message: 'Token invalide.' })
    }
    const user = await findUserById(app.prisma, sub)
    if (!user) {
      return reply
        .code(401)
        .send({ error: 'Unauthorized', message: 'Utilisateur introuvable.' })
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      membreId: user.membreId,
    }
  })

  // POST /auth/changer-mot-de-passe — l'utilisateur connecté change SON propre mot de
  // passe. L'ancien est vérifié (argon2) avant d'accepter ; 401 s'il est incorrect.
  app.post<{ Body: ChangerMdpBody }>(
    '/changer-mot-de-passe',
    { schema: changerMdpBodySchema, preHandler: [authenticate] },
    async (req, reply) => {
      const sub = req.user.sub
      if (!sub) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Token invalide.' })
      }
      const { ancienMotDePasse, nouveauMotDePasse } = req.body
      try {
        await changerMotDePasse(app.prisma, sub, ancienMotDePasse, nouveauMotDePasse)
        return reply.code(204).send()
      } catch (err) {
        if (err instanceof AncienMotDePasseIncorrectError) {
          return reply.code(401).send({ error: 'Unauthorized', message: err.message })
        }
        throw err
      }
    },
  )
}

export default authRoutes
