import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { notifierVersement } from '../services/notification.service'

/**
 * Versements (§5 point 4) — module financier sensible.
 *
 * INVARIANT CRITIQUE : à toute écriture d'un Versement, `Contribution.montantVerse`
 * ET `Contribution.montantValorise` sont ajustés du même delta, DANS UNE TRANSACTION
 * Prisma unique ($transaction interactive), de façon atomique.
 *
 * `montantValorise` est INCRÉMENTÉ (jamais réinitialisé) : il peut déjà refléter un
 * Équilibrage antérieur (§3.1 « modifiable uniquement par un Équilibrage »). Un
 * versement ajoute sa valeur à l'existant ; il ne l'écrase pas.
 *
 * Permissions (matrice §2) :
 *   - create / update / delete : ADMIN + TRESORIERE.
 *   - read : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE ; MEMBRE_SIMPLE limité aux
 *     versements de ses propres contributions.
 */

type ModeVersement = 'ESPECES' | 'TIERS' | 'AUTRE'

interface VersementCreateBody {
  contributionId: string
  montant: number
  dateVersement: string
  mode: ModeVersement
  note?: string
}
interface VersementUpdateBody {
  montant?: number
  dateVersement?: string
  mode?: ModeVersement
  note?: string
}

const MODE_ENUM = ['ESPECES', 'TIERS', 'AUTRE'] as const

const createVersementSchema = {
  body: {
    type: 'object',
    required: ['contributionId', 'montant', 'dateVersement', 'mode'],
    additionalProperties: false,
    properties: {
      contributionId: { type: 'string' },
      montant: { type: 'integer', minimum: 1 },
      dateVersement: { type: 'string', maxLength: 40 },
      mode: { type: 'string', enum: MODE_ENUM },
      note: { type: 'string', maxLength: 1000 },
    },
  },
} as const

const updateVersementSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      montant: { type: 'integer', minimum: 1 },
      dateVersement: { type: 'string', maxLength: 40 },
      mode: { type: 'string', enum: MODE_ENUM },
      note: { type: 'string', maxLength: 1000 },
    },
  },
} as const

const isP2025 = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'

export const versementsRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Versement', action)

  // POST /versements — crée le versement + incrémente montantVerse & montantValorise (atomique).
  app.post<{ Body: VersementCreateBody }>(
    '/versements',
    { schema: createVersementSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      const { contributionId, montant, dateVersement, mode, note } = req.body

      const data: Prisma.VersementUncheckedCreateInput = {
        contributionId,
        montant,
        dateVersement: new Date(dateVersement),
        mode,
      }
      if (note !== undefined) data.note = note
      if (req.user.sub) data.receptionnaireId = req.user.sub

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const versement = await tx.versement.create({ data })
          const contribution = await tx.contribution.update({
            where: { id: contributionId },
            data: {
              montantVerse: { increment: montant },
              montantValorise: { increment: montant },
            },
          })
          return { versement, contribution }
        })

        // Déclencheur de notification « versement enregistré » (§5) — APRÈS la
        // transaction, best-effort : une notification n'est qu'un effet de bord et ne
        // doit JAMAIS faire échouer ni annuler l'écriture financière déjà committée.
        // (NB : aucune génération de Reçu ici — cf. garde §4.6.)
        try {
          await notifierVersement(app.prisma, {
            versementId: result.versement.id,
            membreId: result.contribution.membreId,
            montant: result.versement.montant,
            annee: result.contribution.annee,
          })
        } catch (notifErr) {
          app.log.error({ err: notifErr }, 'Notification de versement non créée')
        }

        return reply.code(201).send(result)
      } catch (err) {
        if (isP2025(err)) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Contribution introuvable.' })
        }
        throw err
      }
    },
  )

  // GET /versements?contributionId= — lecture ; MEMBRE_SIMPLE limité à ses contributions.
  app.get<{ Querystring: { contributionId?: string } }>(
    '/versements',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { contributionId: { type: 'string' } },
        },
      },
      preHandler: [authenticate, perm('read')],
    },
    async (req) => {
      const where: Prisma.VersementWhereInput = {}
      if (req.query.contributionId !== undefined) {
        where.contributionId = req.query.contributionId
      }
      if (req.user.role === 'MEMBRE_SIMPLE') {
        // Versements dont la contribution appartient à un membre rattaché à ce compte.
        where.contribution = {
          membre: { compteUtilisateurId: req.user.sub ?? '' },
        }
      }
      return app.prisma.versement.findMany({
        where,
        orderBy: { dateVersement: 'desc' },
      })
    },
  )

  // PATCH /versements/:id — met à jour + reporte le delta de montant sur la contribution (atomique).
  app.patch<{ Params: { id: string }; Body: VersementUpdateBody }>(
    '/versements/:id',
    { schema: updateVersementSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      const body = req.body
      try {
        const versement = await app.prisma.$transaction(async (tx) => {
          const existing = await tx.versement.findUnique({
            where: { id: req.params.id },
          })
          if (!existing) {
            throw new Prisma.PrismaClientKnownRequestError('Versement introuvable', {
              code: 'P2025',
              clientVersion: 'nkoni',
            })
          }

          const data: Prisma.VersementUncheckedUpdateInput = {}
          if (body.montant !== undefined) data.montant = body.montant
          if (body.dateVersement !== undefined) data.dateVersement = new Date(body.dateVersement)
          if (body.mode !== undefined) data.mode = body.mode
          if (body.note !== undefined) data.note = body.note

          const updated = await tx.versement.update({
            where: { id: req.params.id },
            data,
          })

          // Report du delta sur montantVerse ET montantValorise si le montant change.
          if (body.montant !== undefined) {
            const delta = body.montant - existing.montant
            if (delta !== 0) {
              await tx.contribution.update({
                where: { id: existing.contributionId },
                data: {
                  montantVerse: { increment: delta },
                  montantValorise: { increment: delta },
                },
              })
            }
          }
          return updated
        })
        return versement
      } catch (err) {
        if (isP2025(err)) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Versement introuvable.' })
        }
        throw err
      }
    },
  )

  // DELETE /versements/:id — supprime + décrémente montantVerse & montantValorise (atomique).
  app.delete<{ Params: { id: string } }>(
    '/versements/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await app.prisma.$transaction(async (tx) => {
          const existing = await tx.versement.findUnique({
            where: { id: req.params.id },
          })
          if (!existing) {
            throw new Prisma.PrismaClientKnownRequestError('Versement introuvable', {
              code: 'P2025',
              clientVersion: 'nkoni',
            })
          }
          await tx.versement.delete({ where: { id: req.params.id } })
          await tx.contribution.update({
            where: { id: existing.contributionId },
            data: {
              montantVerse: { decrement: existing.montant },
              montantValorise: { decrement: existing.montant },
            },
          })
        })
        return reply.code(204).send()
      } catch (err) {
        if (isP2025(err)) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: 'Versement introuvable.' })
        }
        throw err
      }
    },
  )
}

export default versementsRoutes
