import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { t, langueDeRequete } from '../lib/i18n'
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

/**
 * Mappe les erreurs métier de l'équilibrage en 400 explicite (message i18n dans la langue
 * du destinataire, §4) ; relance le reste. Le service reste i18n-agnostique : on mappe par
 * TYPE d'erreur et on ré-interpole ici via `t()`.
 */
function reply400SiMetier(
  err: unknown,
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply,
): boolean {
  const langue = langueDeRequete(req)
  if (err instanceof EquilibragePlageInvalideError) {
    reply.code(400).send({
      error: 'Bad Request',
      message: t(langue, 'equilibrages.plageInvalide', {
        anneeDebut: err.anneeDebut,
        anneeFin: err.anneeFin,
      }),
    })
    return true
  }
  if (err instanceof EquilibrageAnneeManquanteError) {
    reply.code(400).send({
      error: 'Bad Request',
      message: t(langue, 'equilibrages.anneeManquante', { annee: err.annee }),
    })
    return true
  }
  if (err instanceof EquilibrageSommeInvalideError) {
    // Deux variantes : nombre de montants ≠ nombre d'années (contexte présent) vs somme ≠ total.
    const message =
      err.nombreAnnees !== undefined
        ? t(langue, 'equilibrages.nombreMontantsInvalide', {
            nombreAnnees: err.nombreAnnees,
            anneeDebut: err.anneeDebut!,
            anneeFin: err.anneeFin!,
            nombreFournis: err.nombreFournis!,
          })
        : t(langue, 'equilibrages.sommeInvalide', {
            sommeAjustee: err.sommeAjustee,
            totalPeriode: err.totalPeriode,
          })
    reply.code(400).send({ error: 'Bad Request', message })
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
        if (reply400SiMetier(err, req, reply)) return
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
        if (reply400SiMetier(err, req, reply)) return
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
