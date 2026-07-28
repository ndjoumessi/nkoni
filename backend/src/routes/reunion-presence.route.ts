import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'

/**
 * RSVP / présence aux réunions (§ vie associative). Deux publics :
 *  - MEMBRE self-service : `PUT /moi/reunions/:id/rsvp` pose SON statut (PRESENT/ABSENT/EXCUSE) —
 *    résolu depuis `req.user.sub`, hors matrice (comme /moi/*), une ligne par (réunion, membre).
 *  - DIRIGEANT : `GET /reunions/:id/presences` (lecture, matrice `Reunion`/read) liste les réponses +
 *    décompte ; `PUT /reunions/:id/presences/:membreId` (matrice `Reunion`/update) ajuste la présence
 *    réelle constatée.
 *
 * `PresenceReunion` est un NOUVEAU modèle : le client Prisma généré ne le connaît qu'après `migrate
 * dev` → surface souple (compile-avant-regen). Écritures scopées tenant (extension) ; les lectures de
 * réunion/membre sont scopées, donc un id d'une autre org renvoie `null` → 404 (isolation).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUTS = ['PRESENT', 'ABSENT', 'EXCUSE'] as const
const rsvpSchema = {
  type: 'object',
  required: ['statut'],
  additionalProperties: false,
  properties: { statut: { type: 'string', enum: STATUTS } },
} as const

export const reunionPresenceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const presence = () => app.prisma.presenceReunion as any
  const reunionExiste = (id: string): Promise<{ id: string } | null> =>
    app.prisma.reunion.findFirst({ where: { id }, select: { id: true } })
  const membreExiste = (id: string): Promise<{ id: string } | null> =>
    app.prisma.membre.findFirst({ where: { id }, select: { id: true } })

  const enregistrerPresence = (reunionId: string, membreId: string, statut: string) =>
    presence().upsert({
      where: { reunionId_membreId: { reunionId, membreId } },
      create: { reunionId, membreId, statut },
      update: { statut },
    })

  // PUT /moi/reunions/:id/rsvp — le membre pose SA réponse (self-service, hors matrice).
  app.put<{ Params: { id: string }; Body: { statut: string } }>(
    '/moi/reunions/:id/rsvp',
    { preHandler: [authenticate], schema: { body: rsvpSchema } },
    async (req, reply) => {
      const membre = await app.prisma.membre.findFirst({
        where: { compteUtilisateurId: req.user.sub as string },
        select: { id: true },
      })
      if (!membre) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'monEspace.aucuneFiche') })
      }
      // Réunion de SON org (lecture scopée → 404 sans fuite si autre org / inexistante).
      if (!(await reunionExiste(req.params.id))) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'reunions.introuvable') })
      }
      await enregistrerPresence(req.params.id, membre.id, req.body.statut)
      return reply.send({ statut: req.body.statut })
    },
  )

  // GET /reunions/:id/presences — récap dirigeant : réponses + décompte.
  app.get<{ Params: { id: string } }>(
    '/reunions/:id/presences',
    { preHandler: [authenticate, requirePermission('Reunion', 'read')] },
    async (req, reply) => {
      if (!(await reunionExiste(req.params.id))) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'reunions.introuvable') })
      }
      const lignes = (await presence().findMany({
        where: { reunionId: req.params.id },
        select: { membreId: true, statut: true, membre: { select: { nom: true, prenom: true } } },
        orderBy: [{ membre: { nom: 'asc' } }],
      })) as { membreId: string; statut: string; membre: { nom: string; prenom: string } }[]
      const decompte = { PRESENT: 0, ABSENT: 0, EXCUSE: 0 } as Record<string, number>
      for (const l of lignes) decompte[l.statut] = (decompte[l.statut] ?? 0) + 1
      return reply.send({
        presences: lignes.map((l) => ({ membreId: l.membreId, nom: l.membre.nom, prenom: l.membre.prenom, statut: l.statut })),
        decompte,
      })
    },
  )

  // PUT /reunions/:id/presences/:membreId — le dirigeant fixe/ajuste la présence réelle d'un membre.
  app.put<{ Params: { id: string; membreId: string }; Body: { statut: string } }>(
    '/reunions/:id/presences/:membreId',
    { preHandler: [authenticate, requirePermission('Reunion', 'update')], schema: { body: rsvpSchema } },
    async (req, reply) => {
      if (!(await reunionExiste(req.params.id)) || !(await membreExiste(req.params.membreId))) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'reunions.introuvable') })
      }
      await enregistrerPresence(req.params.id, req.params.membreId, req.body.statut)
      return reply.send({ statut: req.body.statut })
    },
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default reunionPresenceRoutes
