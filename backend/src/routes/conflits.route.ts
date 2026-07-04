import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  creerConflit,
  listerConflitsVisibles,
  getConflitSiAutorise,
  majConflit,
  ConflitIntrouvableError,
  AccesConflitRefuseError,
  NiveauResponsableIncoherentError,
  ResponsableIntrouvableError,
  MembreConcerneIntrouvableError,
  type DemandeurConflit,
} from '../services/conflit.service'

/**
 * V2 (§4.4) — Conflits familiaux. MODULE SENSIBLE.
 *
 * Permissions :
 *   - POST /conflits          → déclaration réservée ADMIN/PRESIDENT/SECRETAIRE
 *                               (matrice permissions.ts, entité `Conflit`).
 *   - GET /conflits           → `authenticate` seul ; la liste est filtrée par
 *                               peutVoirConflit (chaque rôle ne voit que ce qu'il a le
 *                               droit de voir : PUBLIC pour tous, BUREAU pour le bureau,
 *                               CONFIDENTIEL pour auteur/responsable/ADMIN).
 *   - GET /conflits/:id       → 404 si absent ; 403 si présent mais non autorisé pour CE
 *                               conflit (pas 404).
 *   - PATCH /conflits/:id     → statut/notes ; auteur, responsable de suivi ou ADMIN.
 *   - pas de DELETE           → un conflit clos reste dans l'historique.
 */

const NIVEAU_ENUM = ['PUBLIC', 'BUREAU', 'CONFIDENTIEL'] as const
const STATUT_ENUM = ['OUVERT', 'EN_COURS', 'RESOLU', 'CLOS'] as const

const idProp = { type: 'string', minLength: 1, maxLength: 64 } as const

const createConflitSchema = {
  body: {
    type: 'object',
    required: ['titre', 'description', 'niveauConfidentialite'],
    additionalProperties: false,
    properties: {
      titre: { type: 'string', minLength: 1, maxLength: 300 },
      description: { type: 'string', minLength: 1, maxLength: 20000 },
      niveauConfidentialite: { type: 'string', enum: NIVEAU_ENUM },
      responsableSuiviId: idProp,
      membresConcernes: { type: 'array', maxItems: 100, items: idProp },
      notes: { type: 'string', maxLength: 20000 },
    },
  },
} as const

const updateConflitSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      statut: { type: 'string', enum: STATUT_ENUM },
      notes: { type: ['string', 'null'], maxLength: 20000 },
    },
  },
} as const

/** Construit l'identité du demandeur (id Utilisateur + rôle) depuis req.user. */
function demandeur(req: FastifyRequest): DemandeurConflit {
  // `id` omis si sub absent (exactOptionalPropertyTypes) — peutVoirConflit gère l'absence.
  return { role: req.user.role, ...(req.user.sub !== undefined ? { id: req.user.sub } : {}) }
}

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof ConflitIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  if (err instanceof AccesConflitRefuseError) {
    reply.code(403).send({ error: 'Forbidden', message: err.message })
    return true
  }
  if (
    err instanceof NiveauResponsableIncoherentError ||
    err instanceof ResponsableIntrouvableError ||
    err instanceof MembreConcerneIntrouvableError
  ) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  return false
}

export const conflitsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /conflits — liste filtrée selon la règle de confidentialité.
  app.get('/conflits', { preHandler: [authenticate] }, async (req) =>
    listerConflitsVisibles(app.prisma, demandeur(req)),
  )

  // GET /conflits/:id — 404 si absent, 403 si non autorisé pour CE conflit.
  app.get<{ Params: { id: string } }>(
    '/conflits/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        return await getConflitSiAutorise(app.prisma, req.params.id, demandeur(req))
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /conflits — déclaration (ADMIN/PRESIDENT/SECRETAIRE). auteurId = demandeur.
  app.post(
    '/conflits',
    { schema: createConflitSchema, preHandler: [authenticate, requirePermission('Conflit', 'create')] },
    async (req, reply) => {
      const auteurId = req.user.sub
      if (!auteurId) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Token invalide.' })
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cree = await creerConflit(app.prisma, req.body as any, auteurId)
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /conflits/:id — suivi (statut/notes) ; auteur, responsable ou ADMIN.
  app.patch<{ Params: { id: string } }>(
    '/conflits/:id',
    { schema: updateConflitSchema, preHandler: [authenticate] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majConflit(app.prisma, req.params.id, req.body as any, demandeur(req))
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default conflitsRoutes
