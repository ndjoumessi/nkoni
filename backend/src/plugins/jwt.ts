import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance } from 'fastify'
import { env } from '../lib/env'

// Typage des décorateurs du namespace 'refresh'.
//
// NB : au runtime, @fastify/jwt attache pour un namespace des méthodes CONTEXT-AWARE
// asynchrones (reply.refreshJwtSign lit/produit dans le contexte ; req.refreshJwtVerify
// lit le token depuis le cookie/header configuré et renvoie une Promise) — exactement
// comme le namespace par défaut. Le helper `FastifyJwtNamespace` fourni par la lib les
// type par erreur comme les fonctions standalone synchrones (token en argument), ce qui
// ne correspond pas au runtime. On déclare donc les signatures context-aware correctes.
declare module 'fastify' {
  interface FastifyReply {
    refreshJwtSign(payload: object, options?: object): Promise<string>
  }
  interface FastifyRequest {
    refreshJwtVerify<Decoded = unknown>(options?: object): Promise<Decoded>
  }
}

/**
 * Enregistre deux instances @fastify/jwt :
 *   - Access token (namespace par défaut) : signé/vérifié via reply.jwtSign / req.jwtVerify
 *     (Bearer header). C'est ce que vérifie le hook `authenticate`.
 *   - Refresh token (namespace 'refresh') : secret DISTINCT, TTL long, lu depuis le
 *     cookie httpOnly `nkoni_refresh`. Décorateurs générés : reply.refreshJwtSign /
 *     req.refreshJwtVerify.
 *
 * Prérequis : @fastify/cookie doit être enregistré AVANT (pour la lecture du cookie).
 */
export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  })

  await app.register(fastifyJwt, {
    namespace: 'refresh',
    jwtSign: 'refreshJwtSign',
    jwtVerify: 'refreshJwtVerify',
    secret: env.JWT_REFRESH_SECRET,
    sign: { expiresIn: env.JWT_REFRESH_TTL },
    cookie: { cookieName: env.REFRESH_COOKIE_NAME, signed: false },
  })
}
