import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles, ROLES_ARGENT } from '../middlewares/permissions'
import {
  creerTontine,
  listerTontines,
  getTontine,
  ouvrirCycle,
  tirerBeneficiaire,
  enregistrerMise,
  reverserTour,
} from '../services/tontine.service'

/**
 * Tontine (§ tontine) — épargne rotative. Deux régimes de garde, comme Cagnottes/Amendes :
 *  - CONFIGURATION (créer tontine, ouvrir un cycle, tirer un bénéficiaire) → matrice `Tontine`.
 *  - FLUX D'ARGENT (enregistrer une mise, reverser le pot) → `requireRoles(ROLES_ARGENT)`
 *    (source unique dans `permissions.ts`), gardé À PART dans la route.
 *
 * Le service porte les erreurs typées ; la route les mappe en 4xx (i18n à la frontière HTTP).
 */

const MODES = ['ORDRE_FIXE', 'TIRAGE', 'ENCHERE'] as const

const creerSchema = {
  body: {
    type: 'object',
    required: ['nom', 'montantBaseMise'],
    additionalProperties: false,
    properties: {
      nom: { type: 'string', minLength: 1, maxLength: 200 },
      montantBaseMise: { type: 'integer', minimum: 1 },
      modeRotation: { type: 'string', enum: MODES },
    },
  },
} as const

const ouvrirCycleSchema = {
  body: {
    type: 'object',
    required: ['participants'],
    additionalProperties: false,
    properties: {
      participants: {
        type: 'array',
        minItems: 2,
        maxItems: 500,
        items: {
          type: 'object',
          required: ['membreId'],
          additionalProperties: false,
          properties: {
            membreId: { type: 'string', minLength: 1 },
            parts: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
  },
} as const

const miseSchema = {
  body: {
    type: 'object',
    required: ['membreId'],
    additionalProperties: false,
    properties: {
      membreId: { type: 'string', minLength: 1 },
      montant: { type: 'integer', minimum: 1 },
    },
  },
} as const

export const tontinesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') => requirePermission('Tontine', action)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => app.prisma as any

  // Configuration -----------------------------------------------------------
  app.post<{ Body: { nom: string; montantBaseMise: number; modeRotation?: 'ORDRE_FIXE' | 'TIRAGE' | 'ENCHERE' } }>(
    '/tontines',
    { preHandler: [authenticate, perm('create')], schema: creerSchema },
    async (req, reply) => {
      const t = await creerTontine(p(), req.body)
      return reply.code(201).send(t)
    },
  )

  app.get('/tontines', { preHandler: [authenticate, perm('read')] }, async () => listerTontines(p()))

  app.get<{ Params: { id: string } }>(
    '/tontines/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req) => getTontine(p(), req.params.id),
  )

  // Ouvrir un cycle (config).
  app.post<{ Params: { id: string }; Body: { participants: { membreId: string; parts?: number }[] } }>(
    '/tontines/:id/cycles',
    { preHandler: [authenticate, perm('update')], schema: ouvrirCycleSchema },
    async (req, reply) => {
      const cycleId = await ouvrirCycle(p(), req.params.id, req.body.participants)
      return reply.code(201).send({ cycleId })
    },
  )

  // Tirer le bénéficiaire d'un tour (config ; TIRAGE uniquement).
  app.post<{ Params: { id: string } }>(
    '/tours/:id/tirer',
    { preHandler: [authenticate, perm('update')] },
    async (req) => tirerBeneficiaire(p(), req.params.id),
  )

  // Flux d'argent -----------------------------------------------------------
  app.post<{ Params: { id: string }; Body: { membreId: string; montant?: number } }>(
    '/tours/:id/mises',
    { preHandler: [authenticate, requireRoles(ROLES_ARGENT)], schema: miseSchema },
    async (req) => enregistrerMise(p(), req.params.id, req.body.membreId, req.body.montant),
  )

  app.post<{ Params: { id: string } }>(
    '/tours/:id/reverser',
    { preHandler: [authenticate, requireRoles(ROLES_ARGENT)] },
    async (req) => reverserTour(p(), req.params.id),
  )
}

export default tontinesRoutes
