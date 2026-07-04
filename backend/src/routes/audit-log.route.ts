import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { listerAuditLog, type FiltresAudit } from '../services/audit.service'

/**
 * V2 (§5) — Journal d'audit. GET /audit-log RÉSERVÉ ADMIN (outil de gouvernance
 * sensible). Filtres : entiteType, entiteId, acteurId, plage de dates. Pagination
 * (limite par défaut 50) car le volume grossit vite. La confidentialité des entrées
 * CONFLIT est appliquée dans le service (peutVoirConflit).
 */

/** Garde ADMIN strict (pas de PRESIDENT ni autre). */
const requireAdmin: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.user.role !== 'ADMIN') {
    reply.code(403).send({
      error: 'Forbidden',
      message: "Le journal d'audit est réservé à l'administrateur.",
    })
  }
}

const querystring = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      entiteType: { type: 'string', maxLength: 40 },
      entiteId: { type: 'string', maxLength: 64 },
      acteurId: { type: 'string', maxLength: 64 },
      dateDebut: { type: 'string', minLength: 4, maxLength: 40 },
      dateFin: { type: 'string', minLength: 4, maxLength: 40 },
      page: { type: 'integer', minimum: 1 },
      limite: { type: 'integer', minimum: 1, maximum: 200 },
    },
  },
} as const

export const auditLogRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: FiltresAudit }>(
    '/audit-log',
    { schema: querystring, preHandler: [authenticate, requireAdmin] },
    async (req) =>
      listerAuditLog(app.prisma, req.query, {
        role: req.user.role,
        ...(req.user.sub !== undefined ? { id: req.user.sub } : {}),
      }),
  )
}

export default auditLogRoutes
