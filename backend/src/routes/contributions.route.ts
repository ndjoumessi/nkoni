import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { exigerPortee, porteeViaMembre } from '../lib/portee-lecteur'
import { Prisma } from '../generated/prisma/client'
import { t, langueDeRequete } from '../lib/i18n'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  ouvrirAnnee,
  ouvrirAnneeMembre,
} from '../services/contribution.service'
import { calculerStatutContribution } from '../services/statutContribution'
import { anneeCouranteApp } from '../lib/date-app'

/**
 * Contributions (§5 points 4-5) : ouverture d'année, lecture (filtrée pour
 * MEMBRE_SIMPLE) et calcul du statut cumulatif branché sur les vraies données.
 */

const ouvrirAnneeSchema = {
  body: {
    type: 'object',
    required: ['annee'],
    additionalProperties: false,
    properties: { annee: { type: 'integer', minimum: 1900, maximum: 2200 } },
  },
} as const

const ouvrirMembreSchema = {
  body: {
    type: 'object',
    required: ['membreId', 'annee'],
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      annee: { type: 'integer', minimum: 1900, maximum: 2200 },
    },
  },
} as const

const listQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      annee: { type: 'integer', minimum: 1900, maximum: 2200 },
    },
  },
} as const

const anneeCourante = (): number => anneeCouranteApp()

export const contributionsRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  // POST /contributions/ouvrir-annee — ADMIN + TRESORIERE (Contribution.create).
  app.post<{ Body: { annee: number } }>(
    '/contributions/ouvrir-annee',
    {
      schema: ouvrirAnneeSchema,
      preHandler: [authenticate, requirePermission('Contribution', 'create')],
    },
    async (req, reply) => {
      const result = await ouvrirAnnee(app.prisma, req.body.annee)
      return reply.code(201).send(result)
    },
  )

  // POST /contributions/ouvrir-membre — ouverture CIBLÉE (un seul membre), ADMIN + TRESORIERE.
  // Permet d'encaisser une année de la fenêtre d'adhésion jamais ouverte globalement (le montant
  // attendu cumulé la compte déjà). Idempotent : renvoie la contribution existante le cas échéant.
  app.post<{ Body: { membreId: string; annee: number } }>(
    '/contributions/ouvrir-membre',
    {
      schema: ouvrirMembreSchema,
      preHandler: [authenticate, requirePermission('Contribution', 'create')],
    },
    async (req, reply) => {
      const contribution = await ouvrirAnneeMembre(app.prisma, req.body.membreId, req.body.annee)
      if (!contribution) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      return reply.code(201).send(contribution)
    },
  )

  // GET /contributions?membreId=&annee= — lecture ; MEMBRE_SIMPLE ne voit que les siennes.
  app.get<{ Querystring: { membreId?: string; annee?: number } }>(
    '/contributions',
    {
      schema: listQuerySchema,
      preHandler: [authenticate, requirePermission('Contribution', 'read')],
    },
    async (req) => {
      const where: Prisma.ContributionWhereInput = {}
      if (req.query.membreId !== undefined) where.membreId = req.query.membreId
      if (req.query.annee !== undefined) where.annee = req.query.annee
      // Restreint aux contributions dont le membre est rattaché à ce compte (lecteur borné).
      Object.assign(where, porteeViaMembre(req.user) ?? {})
      return app.prisma.contribution.findMany({
        where,
        orderBy: { annee: 'asc' },
      })
    },
  )

  // GET /membres/:id/statut — statut cumulatif (§4.1) sur données réelles.
  app.get<{ Params: { id: string } }>(
    '/membres/:id/statut',
    { preHandler: [authenticate, requirePermission('Contribution', 'read')] },
    async (req, reply) => {
      const membre = await app.prisma.membre.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          anneeAdhesion: true,
          anneeFinContribution: true,
          compteUtilisateurId: true,
        },
      })
      if (!membre) {
        return reply.code(404).send({
          error: 'Not Found',
          message: t(langueDeRequete(req), 'contributions.membreIntrouvable'),
        })
      }
      exigerPortee(req.user, membre.compteUtilisateurId, 'membres.introuvable')

      const [baremes, contributions] = await Promise.all([
        app.prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
        app.prisma.contribution.findMany({
          where: { membreId: membre.id },
          select: { annee: true, montantValorise: true },
        }),
      ])

      return calculerStatutContribution({
        baremes,
        contributions,
        anneeAdhesion: membre.anneeAdhesion,
        anneeFinContribution: membre.anneeFinContribution,
        anneeCourante: anneeCourante(),
      })
    },
  )
}

export default contributionsRoutes
