import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { env, isProd } from './lib/env'
import { prisma as defaultPrisma, type PrismaClient } from './lib/prisma'
import { registerJwt } from './plugins/jwt'
import { authRoutes } from './routes/auth.route'
import { membresRoutes } from './routes/membres.route'
import { branchesRoutes } from './routes/branches.route'

// Décoration de l'instance Fastify avec le client Prisma (injectable pour les tests).
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export interface BuildAppOptions {
  /** Client Prisma à utiliser (mock en test). Défaut : singleton réel. */
  prisma?: PrismaClient
  /** Active le logger Fastify. Défaut : true (désactivable en test). */
  logger?: boolean
}

/**
 * Construit l'application Fastify (sans l'écouter) — testable via app.inject().
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true })

  app.decorate('prisma', opts.prisma ?? defaultPrisma)

  // Cookie AVANT jwt (le namespace refresh lit le cookie).
  await app.register(cookie)
  // CORS avec credentials pour que le cookie httpOnly circule cross-port en dev.
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
  await registerJwt(app)

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(membresRoutes)
  await app.register(branchesRoutes)

  return app
}

// Démarrage du serveur uniquement si ce fichier est exécuté directement.
if (require.main === module) {
  buildApp()
    .then((app) => app.listen({ port: 3000, host: '0.0.0.0' }))
    .then((address) => {
      if (!isProd) console.log(`NKONI backend prêt sur ${address}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
