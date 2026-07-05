import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import {
  listerNotifications,
  marquerCommeLue,
  marquerToutesCommeLues,
  compterNonLues,
  NotificationIntrouvableError,
} from '../services/notification.service'

/**
 * Notifications in-app (§5) — chacun ne voit et ne modifie QUE les siennes.
 *
 * Pas de `requirePermission` par rôle ici : l'autorisation n'est pas « rôle × entité »
 * mais « propriété » (destinataireId === utilisateur courant). Toutes les routes filtrent
 * donc par `req.user.sub` (id de l'Utilisateur), il n'y a aucune fuite entre comptes.
 *
 *   GET   /notifications          → les siennes (récentes d'abord)
 *   GET   /notifications/compteur → { nonLues } (badge)
 *   PATCH /notifications/tout-lu  → marque toutes ses non-lues comme lues → { count }
 *   PATCH /notifications/:id/lu   → marque UNE des siennes comme lue (404 si pas la sienne)
 */
export const notificationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/notifications', { preHandler: [authenticate] }, async (req) => {
    return listerNotifications(app.prisma, req.user.sub ?? '')
  })

  app.get('/notifications/compteur', { preHandler: [authenticate] }, async (req) => {
    const nonLues = await compterNonLues(app.prisma, req.user.sub ?? '')
    return { nonLues }
  })

  app.patch('/notifications/tout-lu', { preHandler: [authenticate] }, async (req) => {
    const count = await marquerToutesCommeLues(app.prisma, req.user.sub ?? '')
    return { count }
  })

  app.patch<{ Params: { id: string } }>(
    '/notifications/:id/lu',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        await marquerCommeLue(app.prisma, req.params.id, req.user.sub ?? '')
        return reply.code(204).send()
      } catch (err) {
        // Notif inexistante OU appartenant à un autre compte → 404 (pas de fuite).
        if (err instanceof NotificationIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found', message: 'Notification introuvable.' })
        }
        throw err
      }
    },
  )
}

export default notificationsRoutes
