import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  listerCommemorations,
  getCommemoration,
  creerCommemoration,
  majCommemoration,
  supprimerCommemoration,
  CommemorationIntrouvableError,
  MembreConcerneIntrouvableError,
} from '../services/commemoration.service'

/**
 * V2 — Commémorations / cérémonies.
 *
 * Permissions (matrice permissions.ts, entité `Commemoration`) :
 *   - Lecture : tous les rôles
 *   - create/update : ADMIN, GUIDE_RELIGIEUX, PRESIDENT, SECRETAIRE
 *   - delete : ADMIN, GUIDE_RELIGIEUX
 */

const TYPE_ENUM = ['COMMEMORATION', 'CEREMONIE'] as const
const STATUT_ENUM = ['PLANIFIEE', 'TENUE', 'ANNULEE'] as const
const idProp = { type: 'string', minLength: 1, maxLength: 64 } as const

const titreProp = { type: 'string', minLength: 1, maxLength: 300 } as const
const dateProp = { type: 'string', minLength: 4, maxLength: 40 } as const
const membresProp = { type: 'array', maxItems: 200, items: idProp } as const

const createSchema = {
  body: {
    type: 'object',
    required: ['titre', 'date'],
    additionalProperties: false,
    properties: {
      titre: titreProp,
      type: { type: 'string', enum: TYPE_ENUM },
      date: dateProp,
      lieu: { type: 'string', maxLength: 300 },
      description: { type: 'string', maxLength: 20000 },
      statut: { type: 'string', enum: STATUT_ENUM },
      notes: { type: 'string', maxLength: 20000 },
      membresConcernes: membresProp,
    },
  },
} as const

const updateSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      titre: titreProp,
      type: { type: 'string', enum: TYPE_ENUM },
      date: dateProp,
      lieu: { type: ['string', 'null'], maxLength: 300 },
      description: { type: ['string', 'null'], maxLength: 20000 },
      statut: { type: 'string', enum: STATUT_ENUM },
      notes: { type: ['string', 'null'], maxLength: 20000 },
      membresConcernes: membresProp,
    },
  },
} as const

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof CommemorationIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  if (err instanceof MembreConcerneIntrouvableError) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  return false
}

export const commemorationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Commemoration', action)

  // GET /commemorations — liste (par date décroissante).
  app.get(
    '/commemorations',
    { preHandler: [authenticate, perm('read')] },
    async () => listerCommemorations(app.prisma),
  )

  // GET /commemorations/:id — détail.
  app.get<{ Params: { id: string } }>(
    '/commemorations/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await getCommemoration(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /commemorations — création.
  app.post(
    '/commemorations',
    { schema: createSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cree = await creerCommemoration(app.prisma, req.body as any)
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /commemorations/:id — mise à jour.
  app.patch<{ Params: { id: string } }>(
    '/commemorations/:id',
    { schema: updateSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majCommemoration(app.prisma, req.params.id, req.body as any)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /commemorations/:id — suppression (ADMIN, GUIDE_RELIGIEUX).
  app.delete<{ Params: { id: string } }>(
    '/commemorations/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await supprimerCommemoration(app.prisma, req.params.id)
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default commemorationsRoutes
