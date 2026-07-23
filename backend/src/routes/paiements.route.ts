import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { orgContext } from '../lib/org-context'
import { env } from '../lib/env'
import { t, langueDeRequete } from '../lib/i18n'
import {
  demarrerPaiement,
  confirmerPaiement,
  ConfigPaiementIndisponibleError,
  MontantInvalideError,
  ContributionIntrouvableError,
} from '../services/paiement.service'

/**
 * Paiement en ligne (§ paiement) — SELF-SERVICE membre + webhook PSP.
 *   POST /moi/paiements        → lance le règlement d'une contribution (checkout hébergé) → { urlPaiement }
 *   GET  /moi/paiements/:id     → statut de SON paiement (pour la page de retour)
 *   POST /webhooks/fapshi       → PUBLIC : déclencheur de confirmation (re-vérifie le statut auprès du PSP)
 */
export const paiementsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** Fiche du compte connecté (scopée). */
  const ficheDe = async (sub: string | undefined) => {
    if (!sub) return null
    return app.prisma.membre.findFirst({ where: { compteUtilisateurId: sub }, select: { id: true } })
  }

  // POST /moi/paiements — le membre règle une de SES contributions.
  app.post<{ Body: { contributionId: string; montant: number } }>(
    '/moi/paiements',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['contributionId', 'montant'],
          additionalProperties: false,
          properties: {
            contributionId: { type: 'string', minLength: 1 },
            montant: { type: 'integer', minimum: 100 },
          },
        },
      },
    },
    async (req, reply) => {
      const membre = await ficheDe(req.user.sub)
      if (!membre) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'monEspace.aucuneFiche') })
      }
      const organisationId = req.user.organisationId
      if (!organisationId) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'organisations.introuvable') })
      }
      try {
        const r = await demarrerPaiement(
          { prisma: app.prisma, psp: app.psp },
          {
            organisationId,
            membreId: membre.id,
            contributionId: req.body.contributionId,
            montant: req.body.montant,
            description: 'Cotisation',
            redirectUrl: `${env.PUBLIC_BASE_URL}/mon-espace`,
          },
        )
        return reply.code(201).send(r)
      } catch (err) {
        if (err instanceof MontantInvalideError) {
          return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'paiement.montantInvalide') })
        }
        if (err instanceof ConfigPaiementIndisponibleError) {
          return reply.code(409).send({ error: 'Conflict', message: t(langueDeRequete(req), 'paiement.nonConfigure') })
        }
        if (err instanceof ContributionIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'paiement.contributionIntrouvable') })
        }
        throw err
      }
    },
  )

  // GET /moi/paiements/:id — statut d'un paiement du membre (page de retour après redirection).
  app.get<{ Params: { id: string } }>(
    '/moi/paiements/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const membre = await ficheDe(req.user.sub)
      if (!membre) return reply.code(404).send({ error: 'Not Found' })
      const paiement = await app.prisma.paiement.findFirst({
        where: { id: req.params.id, membreId: membre.id },
        select: { statut: true },
      })
      if (!paiement) return reply.code(404).send({ error: 'Not Found' })
      return { statut: paiement.statut }
    },
  )

  // POST /webhooks/fapshi — PUBLIC (aucune auth). Le corps n'est PAS digne de confiance (Fapshi ne
  // signe pas) : il ne sert qu'à extraire le transId, après quoi on RE-VÉRIFIE le statut auprès du
  // PSP (appel authentifié). On résout l'org du Paiement HORS scope, puis on confirme DANS son
  // contexte. Toujours 200 (un webhook attend un accusé, jamais un 4xx qui le ferait réessayer en boucle).
  app.post<{ Body: { transId?: string } }>(
    '/webhooks/fapshi',
    {
      // Rate-limit large (endpoint public). Corps souple : on ne lit que transId.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const transId = (req.body as { transId?: string } | undefined)?.transId
      if (!transId) return reply.code(200).send({ ok: true })

      // Résolution de l'org du Paiement AVANT tout contexte (comme les liens publics signés).
      // `await` OBLIGATOIRE dans le callback (PrismaPromise paresseuse, cf. §4.6).
      const meta = await orgContext.runUnscoped(async () =>
        await app.prisma.paiement.findFirst({ where: { referenceExterne: transId }, select: { id: true, organisationId: true } }),
      )
      if (!meta) return reply.code(200).send({ ok: true }) // transId inconnu → on ignore silencieusement

      await orgContext.run({ organisationId: meta.organisationId }, async () => {
        try {
          await confirmerPaiement({ prisma: app.prisma, psp: app.psp }, meta.id)
        } catch (err) {
          // Best-effort : on ne renvoie jamais d'erreur au PSP (réessais en boucle). On SIGNALE.
          app.log.error({ err, transId }, 'confirmation de paiement échouée')
          app.observabilite.signaler(err instanceof Error ? err : new Error(String(err)), {
            source: 'webhook-fapshi',
            transId,
          })
        }
      })
      return reply.code(200).send({ ok: true })
    },
  )
}

export default paiementsRoutes
