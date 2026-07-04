import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  assemblerDonneesContributions,
  genererExcel,
  genererPdf,
  type FiltresExport,
} from '../services/export.service'

/**
 * Export des contributions (§5 point 9) — PDF ou Excel, en lecture seule.
 *
 * Permissions (matrice §2, ligne « Export PDF/Excel ») : ADMIN, PRESIDENT, TRESORIERE,
 * COMMISSAIRE_COMPTES → autorisés ; SECRETAIRE et MEMBRE_SIMPLE → 403 (via l'entité
 * `Export`, action `read`). Filtres optionnels : `annee`, `membreId`.
 */

const querySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      format: { type: 'string', enum: ['xlsx', 'pdf'], default: 'xlsx' },
      annee: { type: 'integer', minimum: 1900, maximum: 2200 },
      membreId: { type: 'string' },
    },
  },
} as const

const CONTENT_TYPE = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const

export const exportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { format?: 'xlsx' | 'pdf'; annee?: number; membreId?: string } }>(
    '/exports/contributions',
    { schema: querySchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req, reply) => {
      const format = req.query.format ?? 'xlsx'
      const filtres: FiltresExport = {}
      if (req.query.annee !== undefined) filtres.annee = req.query.annee
      if (req.query.membreId !== undefined) filtres.membreId = req.query.membreId

      const donnees = await assemblerDonneesContributions(app.prisma, filtres)

      const suffixe = filtres.annee !== undefined ? `-${filtres.annee}` : ''
      const nomFichier = `contributions${suffixe}.${format}`
      const buffer =
        format === 'pdf' ? await genererPdf(donnees) : await genererExcel(donnees)

      return reply
        .header('Content-Type', CONTENT_TYPE[format])
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(buffer)
    },
  )
}

export default exportsRoutes
