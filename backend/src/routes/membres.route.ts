import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'

/**
 * Route factice pour valider la chaîne auth → permission de bout en bout.
 *
 * Chaîne de preHandlers :
 *   1. `authenticate`  → 401 si JWT absent/invalide, sinon peuple req.user.
 *   2. `requirePermission('Membre', 'read')` → 403 si le rôle n'a pas le droit de lecture.
 *
 * Le handler ne contient PAS encore de logique CRUD : il renvoie un tableau vide.
 * Le vrai CRUD Membres (avec filtrage « sa propre fiche » pour MEMBRE_SIMPLE) viendra
 * dans une étape ultérieure.
 */
export const membresRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/membres',
    { preHandler: [authenticate, requirePermission('Membre', 'read')] },
    async () => {
      // TODO(étape CRUD) : charger les membres depuis Prisma + filtrage par rôle.
      return []
    },
  )
}

export default membresRoutes
