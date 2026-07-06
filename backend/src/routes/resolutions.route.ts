import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import {
  listerResolutions,
  creerResolution,
  majResolution,
  supprimerResolution,
  ResolutionIntrouvableError,
  ReunionIntrouvableError,
  PointIntrouvableError,
  PointHorsReunionError,
} from '../services/resolution.service'

/**
 * V1.1 (§5) — Résolutions (documentaires, cf. resolution.service.ts).
 *
 * Permissions (matrice permissions.ts, entité `Resolution`) : mêmes règles que Reunion —
 *   Lecture pour tous les rôles MVP ; create/update pour ADMIN, PRESIDENT, SECRETAIRE ;
 *   delete pour ADMIN, PRESIDENT. GUIDE_RELIGIEUX : aucun droit.
 *
 * Liste/création nichées sous la réunion ; mise à jour/suppression par id de résolution.
 */

const STATUT_ENUM = ['ADOPTEE', 'REJETEE', 'REPORTEE'] as const
const texteProp = { type: 'string', minLength: 1, maxLength: 20000 } as const
const dateVoteProp = { type: 'string', minLength: 4, maxLength: 40 } as const

const createResolutionSchema = {
  body: {
    type: 'object',
    required: ['texte'],
    additionalProperties: false,
    properties: {
      texte: texteProp,
      statut: { type: 'string', enum: STATUT_ENUM },
      dateVote: dateVoteProp,
      pointOrdreDuJourId: { type: 'string' },
    },
  },
} as const

const updateResolutionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      texte: texteProp,
      statut: { type: 'string', enum: STATUT_ENUM },
      dateVote: { type: ['string', 'null'], maxLength: 40 },
      // null = détacher le point d'ordre du jour.
      pointOrdreDuJourId: { type: ['string', 'null'] },
    },
  },
} as const

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  const langue = langueDeRequete(reply.request)
  if (err instanceof ResolutionIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'resolutions.introuvable') })
    return true
  }
  if (err instanceof ReunionIntrouvableError) {
    reply
      .code(404)
      .send({ error: 'Not Found', message: t(langue, 'resolutions.reunionIntrouvable') })
    return true
  }
  if (err instanceof PointIntrouvableError) {
    reply
      .code(404)
      .send({ error: 'Not Found', message: t(langue, 'resolutions.pointIntrouvable') })
    return true
  }
  if (err instanceof PointHorsReunionError) {
    reply
      .code(400)
      .send({ error: 'Bad Request', message: t(langue, 'resolutions.pointHorsReunion') })
    return true
  }
  return false
}

export const resolutionsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Resolution', action)

  // GET /reunions/:reunionId/resolutions — liste des résolutions d'une réunion.
  app.get<{ Params: { reunionId: string } }>(
    '/reunions/:reunionId/resolutions',
    { preHandler: [authenticate, perm('read')] },
    async (req) => listerResolutions(app.prisma, req.params.reunionId),
  )

  // POST /reunions/:reunionId/resolutions — création (point d'ordre du jour optionnel).
  app.post<{ Params: { reunionId: string } }>(
    '/reunions/:reunionId/resolutions',
    { schema: createResolutionSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cree = await creerResolution(app.prisma, req.params.reunionId, req.body as any)
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /resolutions/:id — mise à jour.
  app.patch<{ Params: { id: string } }>(
    '/resolutions/:id',
    { schema: updateResolutionSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majResolution(app.prisma, req.params.id, req.body as any)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /resolutions/:id — suppression.
  app.delete<{ Params: { id: string } }>(
    '/resolutions/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await supprimerResolution(app.prisma, req.params.id)
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default resolutionsRoutes
