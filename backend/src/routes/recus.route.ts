import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { genererRecu, VersementIntrouvableError } from '../services/recu.service'

/**
 * Reçu de versement (§4.6) — génération À LA DEMANDE et lecture.
 *
 * Permissions (matrice §2, ligne « Reçu » = Générer) :
 *   - create : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES, et MEMBRE_SIMPLE
 *     UNIQUEMENT pour ses propres versements (SECRETAIRE : —, donc 403).
 *   - read   : mêmes rôles ; MEMBRE_SIMPLE limité aux reçus de ses propres versements.
 *
 * Le modèle `Recu` ne porte pas de relation Prisma vers `Versement` (§3.1) ; le filtrage
 * « par membre » passe donc par une résolution applicative
 * Versement → Contribution → Membre, puis un `recu.findMany({ versementId: { in } })`.
 */

const listQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      versementId: { type: 'string' },
    },
  },
} as const

export const recusRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /versements/:versementId/recu — génère un Recu pour ce versement.
  app.post<{ Params: { versementId: string } }>(
    '/versements/:versementId/recu',
    { preHandler: [authenticate, requirePermission('Recu', 'create')] },
    async (req, reply) => {
      const { versementId } = req.params

      // MEMBRE_SIMPLE : ne peut générer que le reçu de SES propres versements.
      // Contrôle de périmètre AVANT toute écriture (404 si inconnu, 403 si pas le sien).
      if (req.user.role === 'MEMBRE_SIMPLE') {
        const v = await app.prisma.versement.findUnique({
          where: { id: versementId },
          select: {
            contribution: { select: { membre: { select: { compteUtilisateurId: true } } } },
          },
        })
        if (!v) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Versement introuvable.' })
        }
        if (v.contribution?.membre?.compteUtilisateurId !== req.user.sub) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Accès limité à vos propres versements.',
          })
        }
      }

      try {
        const recu = await genererRecu(app.prisma, versementId, req.user.sub ?? '')
        return reply.code(201).send(recu)
      } catch (err) {
        if (err instanceof VersementIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message })
        }
        throw err
      }
    },
  )

  // GET /recus?membreId=&versementId= — lecture ; MEMBRE_SIMPLE limité aux siens.
  app.get<{ Querystring: { membreId?: string; versementId?: string } }>(
    '/recus',
    { schema: listQuerySchema, preHandler: [authenticate, requirePermission('Recu', 'read')] },
    async (req) => {
      const { membreId, versementId } = req.query
      const scoping = req.user.role === 'MEMBRE_SIMPLE'

      // Cas simple (rôle privilégié, pas de filtre par membre) : lecture directe.
      if (!scoping && membreId === undefined) {
        const where: Prisma.RecuWhereInput = {}
        if (versementId !== undefined) where.versementId = versementId
        return app.prisma.recu.findMany({ where, orderBy: { dateGeneration: 'desc' } })
      }

      // Filtrage par membre : on résout d'abord les versements concernés
      // (Versement → Contribution → Membre), puis on lit les reçus de ces versements.
      const contribution: Prisma.ContributionWhereInput = {}
      if (membreId !== undefined) contribution.membreId = membreId
      if (scoping) contribution.membre = { compteUtilisateurId: req.user.sub ?? '' }

      const versementWhere: Prisma.VersementWhereInput = { contribution }
      if (versementId !== undefined) versementWhere.id = versementId

      const versements = await app.prisma.versement.findMany({
        where: versementWhere,
        select: { id: true },
      })
      const ids = versements.map((v) => v.id)

      return app.prisma.recu.findMany({
        where: { versementId: { in: ids } },
        orderBy: { dateGeneration: 'desc' },
      })
    },
  )
}

export default recusRoutes
