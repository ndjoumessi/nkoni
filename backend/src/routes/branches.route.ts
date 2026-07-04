import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'

/**
 * CRUD BrancheFamiliale (§5 point 2), conforme à la matrice §2 :
 *   - Lecture : ADMIN, PRESIDENT, SECRETAIRE, TRESORIERE, COMMISSAIRE_COMPTES
 *     (MEMBRE_SIMPLE absent de la ligne → 403 via requirePermission).
 *   - Écriture (create/update/delete) : ADMIN uniquement (CRUD).
 * Les 403 de rôle sont assurés par requirePermission ; ces handlers ne portent
 * que la logique métier/données.
 */

interface BrancheCreateBody {
  nom: string
  description?: string
}
interface BrancheUpdateBody {
  nom?: string
  description?: string
}

const createBrancheSchema = {
  body: {
    type: 'object',
    required: ['nom'],
    additionalProperties: false,
    properties: {
      nom: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 1000 },
    },
  },
} as const

const updateBrancheSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      nom: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 1000 },
    },
  },
} as const

export const branchesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('BrancheFamiliale', action)

  // Lecture de toutes les branches.
  app.get(
    '/branches',
    { preHandler: [authenticate, perm('read')] },
    async () => app.prisma.brancheFamiliale.findMany({ orderBy: { nom: 'asc' } }),
  )

  // Création (ADMIN).
  app.post<{ Body: BrancheCreateBody }>(
    '/branches',
    { schema: createBrancheSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      const { nom, description } = req.body
      const branche = await app.prisma.brancheFamiliale.create({
        data: { nom, description: description ?? null },
      })
      return reply.code(201).send(branche)
    },
  )

  // Mise à jour partielle (ADMIN).
  app.patch<{ Params: { id: string }; Body: BrancheUpdateBody }>(
    '/branches/:id',
    { schema: updateBrancheSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      const data: Prisma.BrancheFamilialeUncheckedUpdateInput = {}
      if (req.body.nom !== undefined) data.nom = req.body.nom
      if (req.body.description !== undefined) data.description = req.body.description

      try {
        return await app.prisma.brancheFamiliale.update({
          where: { id: req.params.id },
          data,
        })
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Branche introuvable.' })
        }
        throw err
      }
    },
  )

  // Suppression (ADMIN).
  app.delete<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await app.prisma.brancheFamiliale.delete({ where: { id: req.params.id } })
        return reply.code(204).send()
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Branche introuvable.' })
        }
        throw err
      }
    },
  )
}

export default branchesRoutes
