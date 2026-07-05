import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { env, isProd } from './lib/env'
import { prisma as defaultPrisma, type PrismaClient } from './lib/prisma'
import { vercelBlobClient } from './lib/blob'
import type { BlobClient } from './services/document.service'
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
import { reunionsRoutes } from './routes/reunions.route'
import { resolutionsRoutes } from './routes/resolutions.route'
import { fonctionsRoutes } from './routes/fonctions.route'
import { affectationsRoutes } from './routes/affectations.route'
import { conflitsRoutes } from './routes/conflits.route'
import { commemorationsRoutes } from './routes/commemorations.route'
import { documentsRoutes } from './routes/documents.route'
import { auditLogRoutes } from './routes/audit-log.route'
import { rapportsRoutes } from './routes/rapports.route'
import { auditContext } from './lib/audit-context'

// Décoration de l'instance Fastify avec le client Prisma + le client Blob (injectables en test).
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    blob: BlobClient
  }
}

export interface BuildAppOptions {
  /** Client Prisma à utiliser (mock en test). Défaut : singleton réel. */
  prisma?: PrismaClient
  /** Client Blob à utiliser (mock en test). Défaut : Vercel Blob réel. */
  blob?: BlobClient
  /** Active le logger Fastify. Défaut : true (désactivable en test). */
  logger?: boolean
}

/**
 * Construit l'application Fastify (sans l'écouter) — testable via app.inject().
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true })

  app.decorate('prisma', opts.prisma ?? defaultPrisma)
  app.decorate('blob', opts.blob ?? vercelBlobClient)

  // Audit trail (V2 §5) : établit le contexte ALS par requête ; l'acteur est renseigné
  // ensuite par le middleware d'authentification, puis lu par l'extension Prisma.
  app.addHook('onRequest', (_req, _reply, done) => {
    auditContext.enter()
    done()
  })

  // Multipart pour l'upload de documents (§5). Limite un peu au-dessus de 10 Mo :
  // la validation fine des 10 Mo est faite dans le service (validerFichier → 400).
  await app.register(multipart, { limits: { fileSize: 11 * 1024 * 1024, files: 1 } })

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
  await app.register(reunionsRoutes)
  await app.register(resolutionsRoutes)
  await app.register(fonctionsRoutes)
  await app.register(affectationsRoutes)
  await app.register(conflitsRoutes)
  await app.register(commemorationsRoutes)
  await app.register(documentsRoutes)
  await app.register(auditLogRoutes)
  await app.register(rapportsRoutes)

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
