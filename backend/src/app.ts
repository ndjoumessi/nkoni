import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { env, isProd } from './lib/env'
import { prisma as defaultPrisma, type PrismaClient } from './lib/prisma'
import { registerJwt } from './plugins/jwt'
import { authRoutes } from './routes/auth.route'
import { membresRoutes } from './routes/membres.route'
import { branchesRoutes } from './routes/branches.route'
import { baremeRoutes } from './routes/bareme.route'
import { contributionsRoutes } from './routes/contributions.route'
import { versementsRoutes } from './routes/versements.route'
import { equilibragesRoutes } from './routes/equilibrages.route'
import { recusRoutes } from './routes/recus.route'
import { dashboardRoutes } from './routes/dashboard.route'
import { exportsRoutes } from './routes/exports.route'
import { utilisateursRoutes } from './routes/utilisateurs.route'

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
  // CORS avec credentials pour que le cookie httpOnly circule cross-origin.
  // CORS_ORIGIN accepte une liste séparée par des virgules (front canonique + ancien alias).
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  })
  await registerJwt(app)

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(membresRoutes)
  await app.register(branchesRoutes)
  await app.register(baremeRoutes)
  await app.register(contributionsRoutes)
  await app.register(versementsRoutes)
  await app.register(equilibragesRoutes)
  await app.register(recusRoutes)
  await app.register(dashboardRoutes)
  await app.register(exportsRoutes)
  await app.register(utilisateursRoutes)

  return app
}

// Démarrage du serveur uniquement si ce fichier est exécuté directement.
if (require.main === module) {
  // Railway (et la plupart des PaaS) injectent le port d'écoute via $PORT.
  const port = Number(process.env['PORT']) || 3000
  buildApp()
    .then((app) => app.listen({ port, host: '0.0.0.0' }))
    .then((address) => {
      if (!isProd) console.log(`NKONI backend prêt sur ${address}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
