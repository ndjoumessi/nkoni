import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { orgContext } from '../lib/org-context'
import { t, langueDeRequete } from '../lib/i18n'
import { signAccessToken } from '../lib/session'
import { langueEffective } from '../services/auth.service'
import { chargerCompteDemo } from '../services/demo.service'

/**
 * POST /demo/session — PUBLIC (spec 2026-09-15 §1.2).
 *
 * Émet un access token de l'espace de démonstration, porteur du claim `demo: true` (lecture seule,
 * cf. `authenticate`). AUCUN cookie de refresh : un administrateur réel connecté dans le même
 * navigateur garde sa session intacte (même nom et même chemin de cookie). Le front redemande un
 * jeton à l'expiration. 404 uniforme tant que la démo est éteinte (`DEMO_ACTIVEE`) ou absente.
 */
export const demoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/demo/session',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const indisponible = () =>
        reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'commun.demoIndisponible') })

      if (!app.demoActivee) return indisponible()
      // Aucun contexte d'organisation avant la session : lecture délibérément non scopée, `await`
      // DANS le callback (une PrismaPromise est paresseuse, cf. CLAUDE.md « Liens publics signés »).
      const compte = await orgContext.runUnscoped(async () => await chargerCompteDemo(app.prisma))
      if (!compte) return indisponible()

      const accessToken = await signAccessToken(reply, compte, { demo: true })
      return reply.code(200).send({
        accessToken,
        user: {
          id: compte.id,
          email: compte.email,
          role: compte.role,
          langue: langueEffective(compte),
          devise: compte.devise,
          nomOrganisation: compte.nomOrganisation,
        },
      })
    },
  )
}
