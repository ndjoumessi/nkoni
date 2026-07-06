import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { env } from '../lib/env'
import { authenticate } from '../middlewares/authenticate'
import { orgContext } from '../lib/org-context'
import { signAccessToken, emettreSession } from '../lib/session'
import {
  verifyCredentials,
  findUserById,
  changerMotDePasse,
  definirLangue,
  AncienMotDePasseIncorrectError,
} from '../services/auth.service'
import { chargerOrganisationActif } from '../services/organisation.service'
import { t, langueDeRequete } from '../lib/i18n'

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

const langueBodySchema = {
  body: {
    type: 'object',
    required: ['langue'],
    additionalProperties: false,
    properties: {
      langue: { type: 'string', enum: ['FR', 'EN'] },
    },
  },
} as const

interface LangueBody {
  langue: 'FR' | 'EN'
}

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /auth/login
  app.post<{ Body: LoginBody }>(
    '/login',
    { schema: loginBodySchema },
    async (req, reply) => {
      const { email, password, rememberMe } = req.body
      // Pré-auth : l'organisation n'est pas encore connue → lecture DÉLIBÉRÉMENT non scopée
      // (email globalement unique). L'org de l'utilisateur alimente ensuite le token.
      const user = await orgContext.runUnscoped(async () =>
        verifyCredentials(app.prisma, email, password),
      )
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

      // Espace suspendu (§2.3) : un utilisateur tenant dont l'organisation est désactivée ne
      // peut pas ouvrir de session. Le SUPER_ADMIN (organisationId null) n'est jamais concerné.
      const orgId = user.organisationId
      if (orgId) {
        const orgActive = await orgContext.runUnscoped(async () =>
          chargerOrganisationActif(app.prisma, orgId),
        )
        if (orgActive !== true) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Cet espace a été suspendu. Contactez le support.',
          })
        }
      }

      // « Se souvenir de moi » n'agit QUE sur la longévité du refresh (30 j si coché, 7 j sinon).
      const accessToken = await emettreSession(reply, user, rememberMe)

      return reply.code(200).send({
        accessToken,
        user: { id: user.id, email: user.email, role: user.role, langue: user.langue },
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

      // Pré-auth (le contexte org n'est pas encore établi) : lecture par id non scopée.
      const sub = payload.sub
      const user = await orgContext.runUnscoped(async () => findUserById(app.prisma, sub))
      if (!user || !user.actif) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Session invalide.' })
      }

      // Espace suspendu (§2.3) : refuser aussi la réémission d'un access token → l'utilisateur
      // d'un espace désactivé est déconnecté au plus tard au prochain refresh (tokens courts).
      const orgId = user.organisationId
      if (orgId) {
        const orgActive = await orgContext.runUnscoped(async () =>
          chargerOrganisationActif(app.prisma, orgId),
        )
        if (orgActive !== true) {
          return reply
            .code(401)
            .send({ error: 'Unauthorized', message: 'Session invalide.' })
        }
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
    // Lecture du PROPRE compte par id (sub du JWT). En `runUnscoped` : un SUPER_ADMIN n'a
    // pas de contexte d'organisation → sans bypass, l'extension d'isolation fail-close sur
    // Utilisateur (modèle scopé). Sûr : on ne lit que le compte authentifié.
    const user = await orgContext.runUnscoped(async () => findUserById(app.prisma, sub))
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
      // §4 i18n : préférence de langue perso (null = non exprimée → le front retombe sur son
      // choix localStorage/navigateur). Le front applique cette langue au montage.
      langue: user.langue,
    }
  })

  // PATCH /auth/me/langue — l'utilisateur connecté fixe SA préférence de langue (§4).
  // Réémet un access token portant la nouvelle langue (le front remplace son token en mémoire),
  // pour que les messages serveur suivants soient rendus dans la bonne langue sans reconnexion.
  app.patch<{ Body: LangueBody }>(
    '/me/langue',
    { schema: langueBodySchema, preHandler: [authenticate] },
    async (req, reply) => {
      const sub = req.user.sub
      if (!sub) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: t(langueDeRequete(req), 'commun.tokenInvalide') })
      }
      // `runUnscoped` : mise à jour du PROPRE compte (sub du JWT). Nécessaire pour un SUPER_ADMIN
      // (sans contexte org, sinon fail-close sur Utilisateur scopé) ; sûr pour tous.
      const user = await orgContext.runUnscoped(async () =>
        definirLangue(app.prisma, sub, req.body.langue),
      )
      if (!user) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: t(req.body.langue, 'commun.tokenInvalide') })
      }
      const accessToken = await signAccessToken(reply, user)
      return reply.code(200).send({ accessToken, langue: user.langue })
    },
  )

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
        // `runUnscoped` : opère sur le PROPRE compte (sub du JWT). Nécessaire pour un
        // SUPER_ADMIN (sans contexte org, sinon fail-close sur Utilisateur scopé) ; sûr pour
        // tous car keyé sur l'utilisateur authentifié.
        await orgContext.runUnscoped(async () =>
          changerMotDePasse(app.prisma, sub, ancienMotDePasse, nouveauMotDePasse),
        )
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
