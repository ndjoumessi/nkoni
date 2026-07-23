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
  MontantSuperieurAuResteError,
  ContributionIntrouvableError,
  TelephonePayeurRequisError,
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
        if (err instanceof MontantSuperieurAuResteError) {
          return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'paiement.montantSuperieurReste') })
        }
        if (err instanceof ConfigPaiementIndisponibleError) {
          return reply.code(409).send({ error: 'Conflict', message: t(langueDeRequete(req), 'paiement.nonConfigure') })
        }
        if (err instanceof ContributionIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'paiement.contributionIntrouvable') })
        }
        if (err instanceof TelephonePayeurRequisError) {
          return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'paiement.telephoneRequis') })
        }
        throw err
      }
    },
  )

  // GET /moi/paiement-disponible — le paiement en ligne est-il ACTIF pour l'org du membre ? Simple
  // indice d'UI (aucun secret) : le front n'affiche « Payer » que si `actif`. Scopé par le contexte.
  app.get('/moi/paiement-disponible', { preHandler: [authenticate] }, async () => {
    const config = await app.prisma.parametrePaiement.findFirst({ select: { actif: true } })
    return { actif: Boolean(config?.actif) }
  })

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

  // Confirmation déclenchée par un webhook PSP — PARTAGÉE Fapshi/CamPay. Le corps du webhook n'est
  // JAMAIS digne de confiance (Fapshi ne signe pas ; CamPay signe mais on ne s'y fie pas) : il ne sert
  // qu'à extraire la RÉFÉRENCE de transaction, après quoi `confirmerPaiement` RE-VÉRIFIE le statut
  // auprès du PSP (appel authentifié). On résout l'org du Paiement HORS scope (`await` OBLIGATOIRE dans
  // le callback — PrismaPromise paresseuse, cf. §4.6), puis on confirme DANS son contexte. Best-effort :
  // on ne renvoie JAMAIS d'erreur au PSP (sinon réessais en boucle), on SIGNALE.
  const confirmerParReference = async (referenceExterne: string | undefined, source: string): Promise<void> => {
    if (!referenceExterne) return
    const meta = await orgContext.runUnscoped(async () =>
      await app.prisma.paiement.findFirst({ where: { referenceExterne }, select: { id: true, organisationId: true } }),
    )
    if (!meta) return // référence inconnue → on ignore silencieusement (pas de fuite d'existence)
    await orgContext.run({ organisationId: meta.organisationId }, async () => {
      try {
        await confirmerPaiement({ prisma: app.prisma, psp: app.psp }, meta.id)
      } catch (err) {
        app.log.error({ err, referenceExterne, source }, 'confirmation de paiement échouée')
        app.observabilite.signaler(err instanceof Error ? err : new Error(String(err)), { source, referenceExterne })
      }
    })
  }

  // POST /webhooks/fapshi — PUBLIC (aucune auth). Corps souple : on ne lit que `transId`. Toujours 200
  // (un webhook attend un accusé, jamais un 4xx qui le ferait réessayer en boucle).
  app.post<{ Body: { transId?: string } }>(
    '/webhooks/fapshi',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      await confirmerParReference((req.body as { transId?: string } | undefined)?.transId, 'webhook-fapshi')
      return reply.code(200).send({ ok: true })
    },
  )

  // POST /webhooks/campay — PUBLIC. Corps souple : on ne lit que `reference` (id de transaction CamPay =
  // notre `referenceExterne`). Même modèle infalsifiable : on re-vérifie le statut de façon authentifiée.
  app.post<{ Body: { reference?: string } }>(
    '/webhooks/campay',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      await confirmerParReference((req.body as { reference?: string } | undefined)?.reference, 'webhook-campay')
      return reply.code(200).send({ ok: true })
    },
  )
}

export default paiementsRoutes
