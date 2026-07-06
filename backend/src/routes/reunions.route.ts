import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import {
  listerReunions,
  getReunion,
  creerReunion,
  majReunion,
  supprimerReunion,
  ajouterPoint,
  majPoint,
  supprimerPoint,
  reordonnerPoints,
  ReunionIntrouvableError,
  PointIntrouvableError,
  ReordonnancementInvalideError,
} from '../services/reunion.service'

/**
 * V1.1 (§5) — Réunions + Ordre du jour.
 *
 * Permissions (matrice permissions.ts, entité `Reunion`) :
 *   - Lecture : ADMIN, PRESIDENT, SECRETAIRE, TRESORIERE, COMMISSAIRE_COMPTES, MEMBRE_SIMPLE
 *   - create : ADMIN, PRESIDENT, SECRETAIRE
 *   - update : ADMIN, PRESIDENT, SECRETAIRE   (toute l'édition de l'ordre du jour —
 *              ajout/modif/suppression/réordonnancement d'un point — relève de `update`)
 *   - delete (supprimer la réunion) : ADMIN, PRESIDENT
 * GUIDE_RELIGIEUX : aucun droit.
 */

const TYPE_ENUM = ['ORDINAIRE', 'EXTRAORDINAIRE'] as const
const STATUT_ENUM = ['PLANIFIEE', 'TENUE', 'ANNULEE'] as const

const titreProp = { type: 'string', minLength: 1, maxLength: 300 } as const
const notesProp = { type: 'string', maxLength: 5000 } as const

const pointInputSchema = {
  type: 'object',
  required: ['titre'],
  additionalProperties: false,
  properties: { titre: titreProp, notes: notesProp },
} as const

const createReunionSchema = {
  body: {
    type: 'object',
    required: ['date', 'lieu'],
    additionalProperties: false,
    properties: {
      date: { type: 'string', minLength: 4, maxLength: 40 },
      lieu: { type: 'string', minLength: 1, maxLength: 300 },
      type: { type: 'string', enum: TYPE_ENUM },
      statut: { type: 'string', enum: STATUT_ENUM },
      compteRenduTexte: { type: 'string', maxLength: 20000 },
      pointsOrdreDuJour: { type: 'array', maxItems: 100, items: pointInputSchema },
    },
  },
} as const

const updateReunionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      date: { type: 'string', minLength: 4, maxLength: 40 },
      lieu: { type: 'string', minLength: 1, maxLength: 300 },
      type: { type: 'string', enum: TYPE_ENUM },
      statut: { type: 'string', enum: STATUT_ENUM },
      // nullable pour permettre d'effacer le compte-rendu.
      compteRenduTexte: { type: ['string', 'null'], maxLength: 20000 },
    },
  },
} as const

const addPointSchema = { body: pointInputSchema } as const

const updatePointSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: { titre: titreProp, notes: { type: ['string', 'null'], maxLength: 5000 } },
  },
} as const

const reorderSchema = {
  body: {
    type: 'object',
    required: ['ordreIds'],
    additionalProperties: false,
    properties: {
      ordreIds: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
    },
  },
} as const

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  const langue = langueDeRequete(reply.request)
  if (err instanceof ReunionIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'reunions.introuvable') })
    return true
  }
  if (err instanceof PointIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'reunions.pointIntrouvable') })
    return true
  }
  if (err instanceof ReordonnancementInvalideError) {
    reply
      .code(400)
      .send({ error: 'Bad Request', message: t(langue, 'reunions.reordonnancementInvalide') })
    return true
  }
  return false
}

export const reunionsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Reunion', action)

  // GET /reunions — liste.
  app.get(
    '/reunions',
    { preHandler: [authenticate, perm('read')] },
    async () => listerReunions(app.prisma),
  )

  // GET /reunions/:id — détail (points ordonnés + résolutions).
  app.get<{ Params: { id: string } }>(
    '/reunions/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await getReunion(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /reunions — création (avec points d'ordre du jour optionnels).
  app.post(
    '/reunions',
    { schema: createReunionSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cree = await creerReunion(app.prisma, req.body as any)
      return reply.code(201).send(cree)
    },
  )

  // PATCH /reunions/:id — mise à jour des champs de la réunion.
  app.patch<{ Params: { id: string } }>(
    '/reunions/:id',
    { schema: updateReunionSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majReunion(app.prisma, req.params.id, req.body as any)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /reunions/:id — suppression (cascade points + résolutions).
  app.delete<{ Params: { id: string } }>(
    '/reunions/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await supprimerReunion(app.prisma, req.params.id)
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /reunions/:id/points — ajoute un point en fin d'ordre du jour.
  app.post<{ Params: { id: string } }>(
    '/reunions/:id/points',
    { schema: addPointSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const point = await ajouterPoint(app.prisma, req.params.id, req.body as any)
        return reply.code(201).send(point)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PUT /reunions/:id/points/ordre — réordonne les points (permutation exacte).
  // Déclaré AVANT /points/:pointId pour éviter que « ordre » soit capté comme un id.
  app.put<{ Params: { id: string }; Body: { ordreIds: string[] } }>(
    '/reunions/:id/points/ordre',
    { schema: reorderSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        return await reordonnerPoints(app.prisma, req.params.id, req.body.ordreIds)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /reunions/:id/points/:pointId — modifie un point.
  app.patch<{ Params: { id: string; pointId: string } }>(
    '/reunions/:id/points/:pointId',
    { schema: updatePointSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majPoint(app.prisma, req.params.pointId, req.body as any)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /reunions/:id/points/:pointId — supprime un point.
  app.delete<{ Params: { id: string; pointId: string } }>(
    '/reunions/:id/points/:pointId',
    { preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        await supprimerPoint(app.prisma, req.params.pointId)
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default reunionsRoutes
