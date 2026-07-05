import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  chargerDonneesRapport,
  genererRapportFinancier,
  comparerPeriodes,
} from '../services/rapport.service'

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
}

export default rapportsRoutes
