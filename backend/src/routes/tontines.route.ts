import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import {
  creerTontine,
  listerTontines,
  getTontine,
  ouvrirCycle,
  tirerBeneficiaire,
  enregistrerMise,
  reverserTour,
  TontineIntrouvableError,
  CycleIntrouvableError,
  TourIntrouvableError,
  MembreIntrouvableError,
  ParticipantsInsuffisantsError,
  ParticipantDupliqueError,
  TourNonAttribueError,
  TourDejaReverseError,
  TourDejaAttribueError,
  ModeNonSupporteError,
  AucunEligibleError,
} from '../services/tontine.service'

/**
 * Tontine (§ tontine) — épargne rotative. Deux régimes de garde, comme Cagnottes/Amendes :
 *  - CONFIGURATION (créer tontine, ouvrir un cycle, tirer un bénéficiaire) → matrice `Tontine`.
 *  - FLUX D'ARGENT (enregistrer une mise, reverser le pot) → `requireRoles(FLUX_ARGENT)`,
 *    strictement ADMIN/PRESIDENT/TRESORIERE, gardé À PART dans la route.
 *
 * Le service porte les erreurs typées ; la route les mappe en 4xx (i18n à la frontière HTTP).
 */

const FLUX_ARGENT = ['ADMIN', 'PRESIDENT', 'TRESORIERE'] as const

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

/** Mappe les erreurs métier en 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  const langue = langueDeRequete(reply.request)
  const envoyer = (code: number, cle: Parameters<typeof t>[1]): boolean => {
    reply.code(code).send({ error: code === 404 ? 'Not Found' : code === 409 ? 'Conflict' : 'Bad Request', message: t(langue, cle) })
    return true
  }
  if (err instanceof TontineIntrouvableError) return envoyer(404, 'tontines.introuvable')
  if (err instanceof CycleIntrouvableError) return envoyer(404, 'tontines.cycleIntrouvable')
  if (err instanceof TourIntrouvableError) return envoyer(404, 'tontines.tourIntrouvable')
  if (err instanceof MembreIntrouvableError) return envoyer(404, 'membres.introuvable')
  if (err instanceof ParticipantsInsuffisantsError) return envoyer(400, 'tontines.participantsInsuffisants')
  if (err instanceof ParticipantDupliqueError) return envoyer(400, 'tontines.participantDuplique')
  if (err instanceof TourNonAttribueError) return envoyer(409, 'tontines.tourNonAttribue')
  if (err instanceof TourDejaReverseError) return envoyer(409, 'tontines.tourDejaReverse')
  if (err instanceof TourDejaAttribueError) return envoyer(409, 'tontines.tourDejaAttribue')
  if (err instanceof AucunEligibleError) return envoyer(409, 'tontines.aucunEligible')
  if (err instanceof ModeNonSupporteError) return envoyer(409, 'tontines.modeNonSupporte')
  return false
}

export const tontinesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') => requirePermission('Tontine', action)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = () => app.prisma as any

  const gerer = async <T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (err) {
      if (reply4xxSiMetier(err, reply)) return undefined
      throw err
    }
  }

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
    async (req, reply) => gerer(reply, () => getTontine(p(), req.params.id)),
  )

  // Ouvrir un cycle (config).
  app.post<{ Params: { id: string }; Body: { participants: { membreId: string; parts?: number }[] } }>(
    '/tontines/:id/cycles',
    { preHandler: [authenticate, perm('update')], schema: ouvrirCycleSchema },
    async (req, reply) => {
      const cycleId = await gerer(reply, () => ouvrirCycle(p(), req.params.id, req.body.participants))
      if (cycleId === undefined) return
      return reply.code(201).send({ cycleId })
    },
  )

  // Tirer le bénéficiaire d'un tour (config ; TIRAGE uniquement).
  app.post<{ Params: { id: string } }>(
    '/tours/:id/tirer',
    { preHandler: [authenticate, perm('update')] },
    async (req, reply) => gerer(reply, () => tirerBeneficiaire(p(), req.params.id)),
  )

  // Flux d'argent -----------------------------------------------------------
  app.post<{ Params: { id: string }; Body: { membreId: string; montant?: number } }>(
    '/tours/:id/mises',
    { preHandler: [authenticate, requireRoles([...FLUX_ARGENT])], schema: miseSchema },
    async (req, reply) => gerer(reply, () => enregistrerMise(p(), req.params.id, req.body.membreId, req.body.montant)),
  )

  app.post<{ Params: { id: string } }>(
    '/tours/:id/reverser',
    { preHandler: [authenticate, requireRoles([...FLUX_ARGENT])] },
    async (req, reply) => gerer(reply, () => reverserTour(p(), req.params.id)),
  )
}

export default tontinesRoutes
