import Fastify, { type FastifyInstance, type FastifyError } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { env, isProd } from './lib/env'
import { t, langueDeRequete } from './lib/i18n'
import { prisma as defaultPrisma, type PrismaClient } from './lib/prisma'
import { vercelBlobClient } from './lib/blob'
import type { BlobClient } from './services/document.service'
import { vraiWhatsAppClient, type WhatsAppClient } from './services/whatsapp.service'
import { registerJwt } from './plugins/jwt'
import { authRoutes } from './routes/auth.route'
import { organisationsRoutes } from './routes/organisations.route'
import { platformRoutes } from './routes/platform.route'
import { membresRoutes } from './routes/membres.route'
import { moiRoutes } from './routes/moi.route'
import { depensesRoutes } from './routes/depenses.route'
import { branchesRoutes } from './routes/branches.route'
import { baremeRoutes } from './routes/bareme.route'
import { contributionsRoutes } from './routes/contributions.route'
import { versementsRoutes } from './routes/versements.route'
import { equilibragesRoutes } from './routes/equilibrages.route'
import { recusRoutes } from './routes/recus.route'
import { cartesRoutes } from './routes/cartes.route'
import { releveRoutes } from './routes/releve.route'
import { cagnottesRoutes } from './routes/cagnottes.route'
import { amendesRoutes } from './routes/amendes.route'
import { membrePhotoRoutes } from './routes/membre-photo.route'
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
import { notificationsRoutes } from './routes/notifications.route'
import { demarrerScheduler } from './services/notification-scheduler'
import { auditContext } from './lib/audit-context'
import { orgContext } from './lib/org-context'
import { vraiObservabiliteClient, type ObservabiliteClient } from './lib/observabilite'

// Décoration de l'instance Fastify avec le client Prisma + le client Blob (injectables en test).
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    blob: BlobClient
    whatsapp: WhatsAppClient
    observabilite: ObservabiliteClient
  }
}

export interface BuildAppOptions {
  /** Client Prisma à utiliser (mock en test). Défaut : singleton réel. */
  prisma?: PrismaClient
  /** Client Blob à utiliser (mock en test). Défaut : Vercel Blob réel. */
  blob?: BlobClient
  /** Client WhatsApp à utiliser (mock en test). Défaut : Meta Cloud API réel (no-op sans env). */
  whatsapp?: WhatsAppClient
  /** Client d'observabilité (mock en test). Défaut : Sentry réel (no-op sans SENTRY_DSN). */
  observabilite?: ObservabiliteClient
  /** Active le logger Fastify. Défaut : true (désactivable en test). */
  logger?: boolean
}

/**
 * Construit l'application Fastify (sans l'écouter) — testable via app.inject().
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // `trustProxy` : derrière Railway/Vercel, l'IP client réelle est dans X-Forwarded-For — sans
  // ça, le rate-limiting keyerait sur l'IP du proxy (un seul seau pour tous → lockout global).
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: true })

  // 5xx : journaliser en détail mais NE JAMAIS exposer le message interne au client (fuite de
  // schéma/contraintes Prisma). Les erreurs 4xx déjà typées (validation, métier) passent telles quelles.
  app.setErrorHandler((error: FastifyError, req, reply) => {
    const statut = error.statusCode ?? 500
    if (statut < 500) {
      reply.send(error)
      return
    }
    req.log.error(error)
    // Observabilité (0.1) : une 5xx est par définition un incident non anticipé — c'est le signal
    // le plus important à remonter. Le `log.error` ci-dessus RESTE : les logs Railway doivent
    // suffire à diagnostiquer même si Sentry est absent ou en panne.
    app.observabilite.signaler(error, {
      source: 'http',
      methode: req.method,
      // `routerPath` = motif de route ('/versements/:id'), pas l'URL réelle : évite de faire fuir
      // des identifiants dans les titres d'incidents, et regroupe correctement les occurrences.
      route: req.routeOptions?.url ?? req.url,
      statut,
    })
    reply.code(500).send({
      error: 'Internal Server Error',
      message: t(langueDeRequete(req), 'commun.erreurServeur'),
    })
  })

  app.decorate('prisma', opts.prisma ?? defaultPrisma)
  app.decorate('blob', opts.blob ?? vercelBlobClient)
  app.decorate('whatsapp', opts.whatsapp ?? vraiWhatsAppClient)
  app.decorate('observabilite', opts.observabilite ?? vraiObservabiliteClient)

  // Contextes ALS par requête : audit (acteur, V2 §5) et organisation (isolation SaaS §2.2).
  // L'acteur et l'organisation sont renseignés ensuite par `authenticate` (après vérif JWT),
  // puis lus par les extensions Prisma. Les flux pré-auth (login/refresh) restent en `{}` et
  // enveloppent leurs lectures dans `runUnscoped` (bypass délibéré).
  app.addHook('onRequest', (_req, _reply, done) => {
    auditContext.enter()
    orgContext.enter()
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

  // En-têtes de sécurité (nosniff, X-Frame-Options, Referrer-Policy, HSTS en prod…). CSP désactivée
  // par défaut : l'API sert du JSON + une page HTML de statut avec CSS inline ; une CSP trop stricte
  // la casserait. `crossOriginResourcePolicy` assoupli pour le proxy same-origin Vercel.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  // Rate limiting (anti brute-force / DoS argon2). Désactivé en test (les suites injectent en
  // rafale). Plafond global généreux ; les routes sensibles (login, inscription) le resserrent
  // via `config.rateLimit` dans leur définition.
  if (!process.env['VITEST'] && process.env['NODE_ENV'] !== 'test') {
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })
  }

  await registerJwt(app)

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(organisationsRoutes)
  await app.register(platformRoutes)
  await app.register(membresRoutes)
  await app.register(moiRoutes)
  await app.register(depensesRoutes)
  await app.register(branchesRoutes)
  await app.register(baremeRoutes)
  await app.register(contributionsRoutes)
  await app.register(versementsRoutes)
  await app.register(equilibragesRoutes)
  await app.register(recusRoutes)
  await app.register(cartesRoutes)
  await app.register(releveRoutes)
  await app.register(cagnottesRoutes)
  await app.register(amendesRoutes)
  await app.register(membrePhotoRoutes)
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
  await app.register(notificationsRoutes)

  return app
}

// Démarrage du serveur uniquement si ce fichier est exécuté directement.
if (require.main === module) {
  // Railway (et la plupart des PaaS) injectent le port d'écoute via $PORT.
  const port = Number(process.env['PORT']) || 3000
  buildApp()
    .then(async (app) => {
      const address = await app.listen({ port, host: '0.0.0.0' })
      // Scheduler démarré UNIQUEMENT dans le serveur long-vivant (jamais via buildApp/tests).
      demarrerScheduler(app)
      return address
    })
    .then((address) => {
      if (!isProd) console.log(`NKONI backend prêt sur ${address}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
