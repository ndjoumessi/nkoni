import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  simulerEquilibrage,
  appliquerEquilibrage,
  listerEquilibrages,
  EquilibragePlageInvalideError,
  EquilibrageAnneeManquanteError,
  EquilibrageSommeInvalideError,
} from '../services/equilibrage.service'

/**
 * Équilibrage entre années (§4.3) — module financier sensible.
 *
 * Permissions (matrice §2, encodées dans PERMISSIONS['Equilibrage']) :
 *   - simuler / appliquer : `create` → ADMIN + TRESORIERE (SECRETAIRE, MEMBRE_SIMPLE : 403).
 *   - lecture              : `read`   → ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES.
 *
 * Toutes les erreurs métier du service (plage invalide, année manquante, somme ajustée
 * != totalPeriode) sont des erreurs de requête → 400.
 */

interface EquilibrageBaseBody {
  membreId: string
  anneeDebut: number
  anneeFin: number
}
interface AppliquerBody extends EquilibrageBaseBody {
  montantsAjustes?: number[]
}

const ANNEE = { type: 'integer', minimum: 1900, maximum: 2200 } as const

const simulerSchema = {
  body: {
    type: 'object',
    required: ['membreId', 'anneeDebut', 'anneeFin'],
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      anneeDebut: ANNEE,
      anneeFin: ANNEE,
    },
  },
} as const

const appliquerSchema = {
  body: {
    type: 'object',
    required: ['membreId', 'anneeDebut', 'anneeFin'],
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      anneeDebut: ANNEE,
      anneeFin: ANNEE,
      // Ordonnés par année croissante (anneeDebut → anneeFin). Somme validée en service.
      montantsAjustes: {
        type: 'array',
        items: { type: 'integer', minimum: 0 },
        minItems: 1,
      },
    },
  },
} as const

const listQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { membreId: { type: 'string' } },
  },
} as const

/** Mappe les erreurs métier de l'équilibrage en 400 explicite ; relance le reste. */
function reply400SiMetier(err: unknown, reply: import('fastify').FastifyReply): boolean {
  if (
    err instanceof EquilibragePlageInvalideError ||
    err instanceof EquilibrageAnneeManquanteError ||
    err instanceof EquilibrageSommeInvalideError
  ) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  return false
}

export const equilibragesRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  // POST /equilibrages/simuler — ADMIN + TRESORIERE. Preview pure, AUCUNE écriture.
  app.post<{ Body: EquilibrageBaseBody }>(
    '/equilibrages/simuler',
    {
      schema: simulerSchema,
      preHandler: [authenticate, requirePermission('Equilibrage', 'create')],
    },
    async (req, reply) => {
      try {
        return await simulerEquilibrage(app.prisma, req.body)
      } catch (err) {
        if (reply400SiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /equilibrages — ADMIN + TRESORIERE. Applique réellement (transaction).
  app.post<{ Body: AppliquerBody }>(
    '/equilibrages',
    {
      schema: appliquerSchema,
      preHandler: [authenticate, requirePermission('Equilibrage', 'create')],
    },
    async (req, reply) => {
      const { membreId, anneeDebut, anneeFin, montantsAjustes } = req.body
      try {
        // `exactOptionalPropertyTypes` : n'ajoute la clé que si réellement fournie.
        const result = await appliquerEquilibrage(app.prisma, {
          membreId,
          anneeDebut,
          anneeFin,
          auteurId: req.user.sub ?? '',
          ...(montantsAjustes !== undefined ? { montantsAjustes } : {}),
        })
        return reply.code(201).send(result)
      } catch (err) {
        if (reply400SiMetier(err, reply)) return
        throw err
      }
    },
  )

  // GET /equilibrages?membreId= — lecture (ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE).
  app.get<{ Querystring: { membreId?: string } }>(
    '/equilibrages',
    {
      schema: listQuerySchema,
      preHandler: [authenticate, requirePermission('Equilibrage', 'read')],
    },
    async (req) => listerEquilibrages(app.prisma, req.query.membreId),
  )
}

export default equilibragesRoutes
