import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from 'fastify'
import { env, isProd, REFRESH_COOKIE_MAX_AGE } from '../lib/env'
import { authenticate } from '../middlewares/authenticate'
import type { Role } from '../middlewares/permissions'
import {
  verifyCredentials,
  findUserById,
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
    },
  },
} as const

interface LoginBody {
  email: string
  password: string
}

/** Options du cookie httpOnly qui porte le refresh token. */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd, // en dev (http://localhost) Secure=false pour que le cookie soit posé
    // En prod, front (Vercel) et back (Railway) sont sur des domaines différents → le cookie
    // refresh doit être SameSite=None; Secure pour circuler en cross-site. En dev, Lax suffit
    // (localhost same-site) et évite d'exiger Secure sur http.
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/auth', // envoyé à /auth/refresh et /auth/logout uniquement
    maxAge: REFRESH_COOKIE_MAX_AGE,
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
      const { email, password } = req.body
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
      const refreshToken = await reply.refreshJwtSign({
        sub: user.id,
        typ: 'refresh',
      })
      reply.setCookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())

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
    reply.clearCookie(env.REFRESH_COOKIE_NAME, { path: '/auth' })
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
}

export default authRoutes
