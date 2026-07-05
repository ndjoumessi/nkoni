import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  chargerDonneesRapport,
  genererRapportFinancier,
  comparerPeriodes,
} from '../services/rapport.service'
import {
  genererEvolutionExcel,
  genererEvolutionPdf,
  genererComparaisonExcel,
  genererComparaisonPdf,
} from '../services/export-rapport.service'

/**
 * Rapports financiers (enrichissement) — agrégations PAR ANNÉE des données existantes.
 *
 * Permissions : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES → autorisés ;
 * SECRETAIRE, MEMBRE_SIMPLE, GUIDE_RELIGIEUX → 403. On réutilise l'entité `Export`
 * (action `read`) dont la matrice §2 donne EXACTEMENT cet ensemble de rôles — cohérent
 * avec l'accès « lecture du module financier » déjà en place.
 *
 *   GET /rapports/financier?anneeDebut=&anneeFin=  → rapport multi-années
 *   GET /rapports/comparaison?anneeA=&anneeB=      → comparaison de deux années
 */

const ANNEE = { type: 'integer', minimum: 1900, maximum: 2200 } as const

const financierSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeDebut', 'anneeFin'],
    properties: { anneeDebut: ANNEE, anneeFin: ANNEE },
  },
} as const

const comparaisonSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeA', 'anneeB'],
    properties: { anneeA: ANNEE, anneeB: ANNEE },
  },
} as const

const FORMAT = { type: 'string', enum: ['xlsx', 'pdf'], default: 'xlsx' } as const

const financierExportSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeDebut', 'anneeFin'],
    properties: { anneeDebut: ANNEE, anneeFin: ANNEE, format: FORMAT },
  },
} as const

const comparaisonExportSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeA', 'anneeB'],
    properties: { anneeA: ANNEE, anneeB: ANNEE, format: FORMAT },
  },
} as const

const CONTENT_TYPE = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const

export const rapportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { anneeDebut: number; anneeFin: number } }>(
    '/rapports/financier',
    { schema: financierSchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req, reply) => {
      const { anneeDebut, anneeFin } = req.query
      if (anneeDebut > anneeFin) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: "L'année de début doit précéder (ou égaler) l'année de fin.",
        })
      }
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      return genererRapportFinancier(anneeDebut, anneeFin, baremes, membres)
    },
  )

  app.get<{ Querystring: { anneeA: number; anneeB: number } }>(
    '/rapports/comparaison',
    { schema: comparaisonSchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req) => {
      const { anneeA, anneeB } = req.query
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      return comparerPeriodes(anneeA, anneeB, baremes, membres)
    },
  )

  /* --- Exports PDF / Excel ---------------------------------------------- */

  app.get<{ Querystring: { anneeDebut: number; anneeFin: number; format?: 'xlsx' | 'pdf' } }>(
    '/rapports/financier/export',
    {
      schema: financierExportSchema,
      preHandler: [authenticate, requirePermission('Export', 'read')],
    },
    async (req, reply) => {
      const { anneeDebut, anneeFin } = req.query
      const format = req.query.format ?? 'xlsx'
      if (anneeDebut > anneeFin) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: "L'année de début doit précéder (ou égaler) l'année de fin.",
        })
      }
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      const rapport = genererRapportFinancier(anneeDebut, anneeFin, baremes, membres)

      const nomFichier = `rapport-financier-${anneeDebut}-${anneeFin}.${format}`
      const buffer =
        format === 'pdf' ? await genererEvolutionPdf(rapport) : await genererEvolutionExcel(rapport)

      return reply
        .header('Content-Type', CONTENT_TYPE[format])
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(buffer)
    },
  )

  app.get<{ Querystring: { anneeA: number; anneeB: number; format?: 'xlsx' | 'pdf' } }>(
    '/rapports/comparaison/export',
    {
      schema: comparaisonExportSchema,
      preHandler: [authenticate, requirePermission('Export', 'read')],
    },
    async (req, reply) => {
      const { anneeA, anneeB } = req.query
      const format = req.query.format ?? 'xlsx'
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      const comparaison = comparerPeriodes(anneeA, anneeB, baremes, membres)

      const nomFichier = `comparaison-${anneeA}-${anneeB}.${format}`
      const buffer =
        format === 'pdf'
          ? await genererComparaisonPdf(comparaison)
          : await genererComparaisonExcel(comparaison)

      return reply
        .header('Content-Type', CONTENT_TYPE[format])
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(buffer)
    },
  )
}

export default rapportsRoutes
