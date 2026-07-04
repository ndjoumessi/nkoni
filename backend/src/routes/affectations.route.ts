import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  creerAffectation,
  listerAffectationsActives,
  listerParMembre,
  FonctionIntrouvableError,
  MembreIntrouvableError,
  DateDebutIncoherenteError,
} from '../services/affectation.service'

/**
 * V1.1 (§5) — Historique des nominations (AffectationFonction).
 *
 * Permissions (matrice permissions.ts, entité `Affectation`) :
 *   - Lecture : tous sauf GUIDE_RELIGIEUX
 *   - create  : ADMIN, PRESIDENT, SECRETAIRE
 *
 * Le seul point d'écriture est la création (nommer un titulaire), qui clôture
 * automatiquement l'affectation active précédente (mono-titulaire, cf. service).
 * L'historique est immuable : pas d'endpoint update/delete d'affectation.
 */

const createAffectationSchema = {
  body: {
    type: 'object',
    required: ['fonctionId', 'membreId', 'dateDebut'],
    additionalProperties: false,
    properties: {
      fonctionId: { type: 'string', minLength: 1, maxLength: 64 },
      membreId: { type: 'string', minLength: 1, maxLength: 64 },
      dateDebut: { type: 'string', minLength: 4, maxLength: 40 },
      notes: { type: 'string', maxLength: 5000 },
    },
  },
} as const

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof FonctionIntrouvableError || err instanceof MembreIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  if (err instanceof DateDebutIncoherenteError) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  return false
}

export const affectationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Affectation', action)

  // GET /affectations/actives — un titulaire par fonction occupée.
  app.get(
    '/affectations/actives',
    { preHandler: [authenticate, perm('read')] },
    async () => listerAffectationsActives(app.prisma),
  )

  // GET /membres/:membreId/affectations — fonctions occupées par un membre (actives + passées).
  app.get<{ Params: { membreId: string } }>(
    '/membres/:membreId/affectations',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await listerParMembre(app.prisma, req.params.membreId)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /affectations — nomme un titulaire (clôture automatique de la précédente).
  app.post(
    '/affectations',
    { schema: createAffectationSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cree = await creerAffectation(app.prisma, req.body as any)
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default affectationsRoutes
