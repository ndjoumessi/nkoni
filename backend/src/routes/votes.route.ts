import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles, ROLES_BUREAU } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import { ResolutionIntrouvableError } from '../services/resolution.service'
import {
  voterResolution,
  depouillerResolution,
  cloturerResolution,
  ResolutionClotureeError,
  MembreIntrouvableError,
  SENS_VOTE,
} from '../services/vote.service'

/**
 * Votes en ligne sur les résolutions (§ vie associative). Deux publics :
 *  - MEMBRE self-service : `PUT /moi/resolutions/:id/vote` pose SON vote (POUR/CONTRE/ABSTENTION) —
 *    résolu depuis `req.user.sub`, hors matrice (comme /moi/*). Refusé si la résolution est clôturée.
 *  - BUREAU : `GET /resolutions/:id/votes` (garde `requireRoles(ROLES_BUREAU)` — PAS la matrice,
 *    qui donnerait `read` à MEMBRE_SIMPLE) = dépouillement + tally nominatifs ;
 *    `POST /resolutions/:id/cloturer` (matrice `Reunion`/update : ADMIN, PRESIDENT, SECRETAIRE)
 *    fige le statut dérivé du tally — déjà plus restrictif que le bureau, laissé tel quel.
 *
 * Le service porte les erreurs typées ; la route les mappe en 4xx (i18n à la frontière HTTP).
 * Les lectures de résolution/membre sont SCOPÉES → un id d'une autre org renvoie `null` → 404.
 */
const voteSchema = {
  type: 'object',
  required: ['sens'],
  additionalProperties: false,
  properties: { sens: { type: 'string', enum: SENS_VOTE } },
} as const

/** Mappe les erreurs métier en 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  const langue = langueDeRequete(reply.request)
  if (err instanceof ResolutionIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'resolutions.introuvable') })
    return true
  }
  if (err instanceof ResolutionClotureeError) {
    reply.code(409).send({ error: 'Conflict', message: t(langue, 'resolutions.cloturee') })
    return true
  }
  // Sans ce mappage, le refus métier remonterait en 500 opaque (défaut déjà vécu sur
  // `versements.modificationRecuActif` : garde posée dans le service, jamais traduite en HTTP).
  if (err instanceof MembreIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'membres.introuvable') })
    return true
  }
  return false
}

export const votesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // PUT /moi/resolutions/:id/vote — le membre pose SON vote (self-service, hors matrice).
  app.put<{ Params: { id: string }; Body: { sens: 'POUR' | 'CONTRE' | 'ABSTENTION' } }>(
    '/moi/resolutions/:id/vote',
    { preHandler: [authenticate], schema: { body: voteSchema } },
    async (req, reply) => {
      const membre = await app.prisma.membre.findFirst({
        where: { compteUtilisateurId: req.user.sub as string },
        select: { id: true },
      })
      if (!membre) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'monEspace.aucuneFiche') })
      }
      try {
        return await voterResolution(app.prisma, req.params.id, membre.id, req.body.sens)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // GET /resolutions/:id/votes — dépouillement (tally + votes NOMINATIFS).
  //
  // Gardé par `requireRoles(ROLES_BUREAU)` et NON par la matrice : `Reunion`/`read` inclut
  // `MEMBRE_SIMPLE`, ce qui exposerait à TOUT membre de l'organisation qui a voté quoi — sur des
  // résolutions pouvant porter sur un conflit, une exclusion ou de l'argent. Le scrutin est
  // nominatif côté bureau, pas public : c'est le sens de « dépouillement ».
  app.get<{ Params: { id: string } }>(
    '/resolutions/:id/votes',
    { preHandler: [authenticate, requireRoles(ROLES_BUREAU)] },
    async (req, reply) => {
      try {
        return await depouillerResolution(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /resolutions/:id/cloturer — fige le statut dérivé du tally (dirigeant).
  app.post<{ Params: { id: string } }>(
    '/resolutions/:id/cloturer',
    { preHandler: [authenticate, requirePermission('Reunion', 'update')] },
    async (req, reply) => {
      try {
        return await cloturerResolution(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default votesRoutes
