import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import {
  listerNotifications,
  marquerCommeLue,
  marquerToutesCommeLues,
  supprimerNotification,
  compterNonLues,
  lirePreferences,
  majPreferences,
  NotificationIntrouvableError,
  TYPES_NOTIFICATION,
  type PreferencesNotification,
} from '../services/notification.service'
import { enregistrerAbonnementPush, supprimerAbonnementPush } from '../services/push.service'

/** Corps d'abonnement Web Push (forme `PushSubscription` du navigateur, restreinte à l'utile). */
const abonnementPushSchema = {
  body: {
    type: 'object',
    required: ['endpoint', 'keys'],
    additionalProperties: false,
    properties: {
      endpoint: { type: 'string', minLength: 1, maxLength: 2000 },
      keys: {
        type: 'object',
        required: ['p256dh', 'auth'],
        additionalProperties: false,
        properties: { p256dh: { type: 'string' }, auth: { type: 'string' } },
      },
    },
  },
} as const

const desabonnementPushSchema = {
  body: {
    type: 'object',
    required: ['endpoint'],
    additionalProperties: false,
    properties: { endpoint: { type: 'string', minLength: 1, maxLength: 2000 } },
  },
} as const

// Propriétés DÉRIVÉES de `TYPES_NOTIFICATION` (source unique) et non recopiées : avec
// `additionalProperties: false`, une liste figée ici rejette en 400 tout type ajouté ailleurs —
// l'interrupteur existe dans l'UI, le scheduler respecte la préférence, mais elle est
// INENREGISTRABLE. C'était le cas de REUNION_RAPPEL. Dérivé, le trou ne peut plus se rouvrir.
const preferencesSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: Object.fromEntries(TYPES_NOTIFICATION.map((t) => [t, { type: 'boolean' }])),
  },
}

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
 *   DELETE /notifications/:id     → supprime UNE des siennes (404 si pas la sienne)
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

  // Préférences de notification (les siennes) — un booléen par type.
  app.get('/notifications/preferences', { preHandler: [authenticate] }, async (req) => {
    return lirePreferences(app.prisma, req.user.sub ?? '')
  })

  app.patch<{ Body: Partial<PreferencesNotification> }>(
    '/notifications/preferences',
    { schema: preferencesSchema, preHandler: [authenticate] },
    async (req) => {
      return majPreferences(app.prisma, req.user.sub ?? '', req.body)
    },
  )

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

  app.delete<{ Params: { id: string } }>(
    '/notifications/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        await supprimerNotification(app.prisma, req.params.id, req.user.sub ?? '')
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

  /* --- Web Push (§ notifications) : clé publique + (dés)abonnement par APPAREIL --------------- */

  // Clé publique VAPID : le front en a besoin pour `PushManager.subscribe`. `null` si non configurée
  // (le front masque alors le bouton d'activation). Pas de secret exposé (la clé publique EST publique).
  app.get('/notifications/push/cle-publique', { preHandler: [authenticate] }, async () => {
    return { clePublique: process.env['VAPID_PUBLIC_KEY'] ?? null }
  })

  // Enregistre l'abonnement de CET appareil. Le modèle PushSubscription est SCOPÉ → il faut un
  // contexte d'organisation (posé par `authenticate`) : un compte sans org (SUPER_ADMIN) → 400.
  app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
    '/notifications/push/subscribe',
    { schema: abonnementPushSchema, preHandler: [authenticate] },
    async (req, reply) => {
      if (!req.user.organisationId) {
        return reply
          .code(400)
          .send({ error: 'Bad Request', message: 'Abonnement push indisponible sans organisation.' })
      }
      await enregistrerAbonnementPush(app.prisma, req.user.sub ?? '', req.body)
      return reply.code(201).send({ ok: true })
    },
  )

  // Désinscription de CET appareil (par endpoint). Best-effort : 204 même si rien à supprimer.
  app.delete<{ Body: { endpoint: string } }>(
    '/notifications/push/subscribe',
    { schema: desabonnementPushSchema, preHandler: [authenticate] },
    async (req, reply) => {
      await supprimerAbonnementPush(app.prisma, req.body.endpoint)
      return reply.code(204).send()
    },
  )
}

export default notificationsRoutes
