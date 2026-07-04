import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'

/**
 * CRUD BaremeAnnuel (§5 point 3), matrice §2 :
 *   - Lecture : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES (pas SECRETAIRE).
 *   - Création / mise à jour : ADMIN uniquement.
 * Contrainte : une seule ligne par année (@@unique) → 409 si l'année existe déjà.
 */

interface BaremeCreateBody {
  annee: number
  montantAttendu: number
}
interface BaremeUpdateBody {
  annee?: number
  montantAttendu?: number
}

const anneeProp = { type: 'integer', minimum: 1900, maximum: 2200 } as const
const montantProp = { type: 'integer', minimum: 0 } as const

const createBaremeSchema = {
  body: {
    type: 'object',
    required: ['annee', 'montantAttendu'],
    additionalProperties: false,
    properties: { annee: anneeProp, montantAttendu: montantProp },
  },
} as const

const updateBaremeSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: { annee: anneeProp, montantAttendu: montantProp },
  },
} as const

export const baremeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('BaremeAnnuel', action)

  app.get(
    '/baremes',
    { preHandler: [authenticate, perm('read')] },
    async () => app.prisma.baremeAnnuel.findMany({ orderBy: { annee: 'desc' } }),
  )

  app.post<{ Body: BaremeCreateBody }>(
    '/baremes',
    { schema: createBaremeSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      const { annee, montantAttendu } = req.body
      try {
        const bareme = await app.prisma.baremeAnnuel.create({
          data: { annee, montantAttendu },
        })
        return reply.code(201).send(bareme)
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return reply.code(409).send({
            error: 'Conflict',
            message: `Un barème existe déjà pour l'année ${annee}.`,
          })
        }
        throw err
      }
    },
  )

  app.patch<{ Params: { id: string }; Body: BaremeUpdateBody }>(
    '/baremes/:id',
    { schema: updateBaremeSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      const data: Prisma.BaremeAnnuelUncheckedUpdateInput = {}
      if (req.body.annee !== undefined) data.annee = req.body.annee
      if (req.body.montantAttendu !== undefined) data.montantAttendu = req.body.montantAttendu

      try {
        return await app.prisma.baremeAnnuel.update({
          where: { id: req.params.id },
          data,
        })
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2025') {
            return reply
              .code(404)
              .send({ error: 'Not Found', message: 'Barème introuvable.' })
          }
          if (err.code === 'P2002') {
            return reply.code(409).send({
              error: 'Conflict',
              message: 'Un barème existe déjà pour cette année.',
            })
          }
        }
        throw err
      }
    },
  )
}

export default baremeRoutes
