import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { t, langueDeRequete } from '../lib/i18n'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles } from '../middlewares/permissions'
import {
  genererRecu,
  annulerRecu,
  VersementIntrouvableError,
  RecuIntrouvableError,
  RecuDejaAnnuleError,
  RecuActifExistantError,
} from '../services/recu.service'
import { chargerDonneesRecuPdf, produireRecuPdf } from '../services/recu-pdf.service'
import { envoyerRecuWhatsApp } from '../services/whatsapp.service'
import {
  resoudreLangueDestinataire,
  resoudreDeviseDestinataire,
} from '../services/notification.service'
import { orgContext } from '../lib/org-context'
import { signerRecu, verifierSignatureRecu } from '../lib/recu-lien'

/** Enrichit un reçu de sa `signaturePartage` (jeton du lien public de téléchargement WhatsApp). */
const avecLienPartage = <T extends { id: string }>(recu: T): T & { signaturePartage: string } => ({
  ...recu,
  signaturePartage: signerRecu(recu.id),
})

/**
 * Reçu de versement (§4.6) — génération À LA DEMANDE et lecture.
 *
 * Permissions (matrice §2, ligne « Reçu » = Générer) :
 *   - create : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES, et MEMBRE_SIMPLE
 *     UNIQUEMENT pour ses propres versements (SECRETAIRE : —, donc 403).
 *   - read   : mêmes rôles ; MEMBRE_SIMPLE limité aux reçus de ses propres versements.
 *
 * Le modèle `Recu` ne porte pas de relation Prisma vers `Versement` (§3.1) ; le filtrage
 * « par membre » passe donc par une résolution applicative
 * Versement → Contribution → Membre, puis un `recu.findMany({ versementId: { in } })`.
 */

const listQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      membreId: { type: 'string' },
      versementId: { type: 'string' },
    },
  },
} as const

export const recusRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /versements/:versementId/recu — génère un Recu pour ce versement.
  app.post<{ Params: { versementId: string } }>(
    '/versements/:versementId/recu',
    { preHandler: [authenticate, requirePermission('Recu', 'create')] },
    async (req, reply) => {
      const { versementId } = req.params

      // MEMBRE_SIMPLE : ne peut générer que le reçu de SES propres versements.
      // Contrôle de périmètre AVANT toute écriture (404 si inconnu, 403 si pas le sien).
      if (req.user.role === 'MEMBRE_SIMPLE') {
        const v = await app.prisma.versement.findUnique({
          where: { id: versementId },
          select: {
            contribution: { select: { membre: { select: { compteUtilisateurId: true } } } },
          },
        })
        if (!v) {
          return reply.code(404).send({
            error: 'Not Found',
            message: t(langueDeRequete(req), 'recus.versementIntrouvable'),
          })
        }
        if (v.contribution?.membre?.compteUtilisateurId !== req.user.sub) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: t(langueDeRequete(req), 'recus.accesVersementsLimite'),
          })
        }
      }

      try {
        const recu = await genererRecu(app.prisma, versementId, req.user.sub ?? '')
        return reply.code(201).send(avecLienPartage(recu))
      } catch (err) {
        if (err instanceof RecuActifExistantError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: t(langueDeRequete(req), 'recus.actifExistant', { numero: err.numero }),
          })
        }
        if (err instanceof VersementIntrouvableError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: t(langueDeRequete(req), 'recus.versementIntrouvableGeneration', {
              versementId: err.versementId,
            }),
          })
        }
        throw err
      }
    },
  )

  // GET /recus?membreId=&versementId= — lecture ; MEMBRE_SIMPLE limité aux siens.
  app.get<{ Querystring: { membreId?: string; versementId?: string } }>(
    '/recus',
    { schema: listQuerySchema, preHandler: [authenticate, requirePermission('Recu', 'read')] },
    async (req) => {
      const { membreId, versementId } = req.query
      const scoping = req.user.role === 'MEMBRE_SIMPLE'

      // Cas simple (rôle privilégié, pas de filtre par membre) : lecture directe.
      if (!scoping && membreId === undefined) {
        const where: Prisma.RecuWhereInput = {}
        if (versementId !== undefined) where.versementId = versementId
        const rs = await app.prisma.recu.findMany({ where, orderBy: { dateGeneration: 'desc' } })
        return rs.map(avecLienPartage)
      }

      // Filtrage par membre : on résout d'abord les versements concernés
      // (Versement → Contribution → Membre), puis on lit les reçus de ces versements.
      const contribution: Prisma.ContributionWhereInput = {}
      if (membreId !== undefined) contribution.membreId = membreId
      if (scoping) contribution.membre = { compteUtilisateurId: req.user.sub ?? '' }

      const versementWhere: Prisma.VersementWhereInput = { contribution }
      if (versementId !== undefined) versementWhere.id = versementId

      const versements = await app.prisma.versement.findMany({
        where: versementWhere,
        select: { id: true },
      })
      const ids = versements.map((v) => v.id)

      const rs = await app.prisma.recu.findMany({
        where: { versementId: { in: ids } },
        orderBy: { dateGeneration: 'desc' },
      })
      return rs.map(avecLienPartage)
    },
  )

  // GET /recus/:id/pdf — proxy authentifié : génère (idempotent) puis sert le PDF du reçu.
  // Accès : rôles gestion (Recu/read) ; MEMBRE_SIMPLE UNIQUEMENT ses propres reçus. 404 sinon
  // (pas de fuite d'existence). L'URL blob n'est jamais exposée ; locale+devise = du DESTINATAIRE.
  app.get<{ Params: { id: string } }>(
    '/recus/:id/pdf',
    { preHandler: [authenticate, requirePermission('Recu', 'read')] },
    async (req, reply) => {
      const ctx = await chargerDonneesRecuPdf(app.prisma, req.params.id)
      if (!ctx) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'recus.introuvable') })
      }
      if (req.user.role === 'MEMBRE_SIMPLE' && ctx.membreCompteId !== req.user.sub) {
        // Indistinguable d'un id inexistant (pas de fuite d'existence d'un reçu d'un autre membre).
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'recus.introuvable') })
      }
      // Reçu ANNULÉ : plus de téléchargement. 409 (et non 404) car l'appelant est authentifié et
      // légitime à savoir que le document existe mais a été annulé — la trace reste lisible via
      // `GET /recus`. Le lien PUBLIC, lui, répond 404 uniforme (cf. plus bas).
      if (ctx.annuleLe) {
        return reply
          .code(409)
          .send({ error: 'Conflict', message: t(langueDeRequete(req), 'recus.annuleNonTelechargeable') })
      }

      // Locale + devise du DESTINATAIRE (le membre) ; repli FR/FCFA si membre sans compte lié.
      const langue = ctx.membreCompteId
        ? await resoudreLangueDestinataire(app.prisma, ctx.membreCompteId)
        : 'FR'
      const devise = ctx.membreCompteId
        ? await resoudreDeviseDestinataire(app.prisma, ctx.membreCompteId)
        : 'FCFA'

      const { buffer } = await produireRecuPdf(app.prisma, app.blob, ctx, langue, devise)
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="recu-${ctx.donnees.numero}.pdf"`)
      return reply.send(buffer)
    },
  )

  // GET /recus/:id/pdf-public?t=<signature> — TÉLÉCHARGEMENT PUBLIC SIGNÉ (partage `wa.me`).
  // PAS d'authentification : la signature HMAC (liée à CET id) tient lieu d'autorisation, pour
  // que le membre destinataire télécharge SON reçu sans compte. Isolation tenant préservée :
  // l'org du reçu est résolue HORS scope (id déjà autorisé par la signature) puis la génération
  // s'exécute DANS le contexte de cette org (aucune fuite cross-tenant, aucune énumération).
  // 404 uniforme sur signature invalide / reçu inconnu (pas de fuite d'existence).
  app.get<{ Params: { id: string }; Querystring: { t?: string } }>(
    '/recus/:id/pdf-public',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['t'],
          properties: { t: { type: 'string' } },
        },
      } as const,
    },
    async (req, reply) => {
      const { id } = req.params
      if (!req.query.t || !verifierSignatureRecu(id, req.query.t)) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      // Résout l'organisation du reçu SANS scope (l'id est déjà autorisé par la signature).
      // IMPORTANT : on `await` DANS le callback `runUnscoped` — une requête Prisma est PARESSEUSE
      // (elle ne s'exécute qu'au `await`) ; l'awaiter à l'extérieur exécuterait la requête HORS du
      // contexte `unscoped` de l'AsyncLocalStorage → l'extension tenant fail-close (500 « hors
      // contexte d'organisation »). L'await interne garantit l'exécution dans le bon contexte.
      const meta = await orgContext.runUnscoped(async () => {
        return await app.prisma.recu.findUnique({
          where: { id },
          select: { organisationId: true },
        })
      })
      if (!meta) return reply.code(404).send({ error: 'Not Found' })

      // Génération DANS le contexte de l'org du reçu → le prisma scopé ne voit que cette org.
      return orgContext.run({ organisationId: meta.organisationId }, async () => {
        const ctx = await chargerDonneesRecuPdf(app.prisma, id)
        if (!ctx) return reply.code(404).send({ error: 'Not Found' })
        // Reçu ANNULÉ : le lien public cesse de servir le document. C'est LE cas qui compte —
        // la signature HMAC n'expire pas et le lien a déjà été envoyé sur WhatsApp, donc sans
        // cette garde un reçu corrigé resterait téléchargeable indéfiniment par le membre.
        // 404 UNIFORME, comme pour une signature invalide (aucune fuite d'existence ni d'état).
        if (ctx.annuleLe) return reply.code(404).send({ error: 'Not Found' })
        const langue = ctx.membreCompteId
          ? await resoudreLangueDestinataire(app.prisma, ctx.membreCompteId)
          : 'FR'
        const devise = ctx.membreCompteId
          ? await resoudreDeviseDestinataire(app.prisma, ctx.membreCompteId)
          : 'FCFA'
        const { buffer } = await produireRecuPdf(app.prisma, app.blob, ctx, langue, devise)
        reply.header('Content-Type', 'application/pdf')
        reply.header('Content-Disposition', `inline; filename="recu-${ctx.donnees.numero}.pdf"`)
        return reply.send(buffer)
      })
    },
  )

  // POST /recus/:id/whatsapp — envoie le PDF du reçu au membre par WhatsApp (best-effort).
  // Même accès que le téléchargement. N'échoue jamais l'appel : renvoie { envoye, raison? }.
  app.post<{ Params: { id: string } }>(
    '/recus/:id/whatsapp',
    { preHandler: [authenticate, requirePermission('Recu', 'read')] },
    async (req, reply) => {
      const ctx = await chargerDonneesRecuPdf(app.prisma, req.params.id)
      if (!ctx) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'recus.introuvable') })
      }
      if (req.user.role === 'MEMBRE_SIMPLE' && ctx.membreCompteId !== req.user.sub) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'recus.introuvable') })
      }
      // Reçu ANNULÉ : ne pas (re)pousser un document corrigé au membre. Refus EXPLICITE (409) et
      // non un `{ envoye: false }` best-effort : ici l'envoi n'échoue pas, il est interdit.
      if (ctx.annuleLe) {
        return reply
          .code(409)
          .send({ error: 'Conflict', message: t(langueDeRequete(req), 'recus.annuleNonTelechargeable') })
      }

      const langue = ctx.membreCompteId
        ? await resoudreLangueDestinataire(app.prisma, ctx.membreCompteId)
        : 'FR'
      const devise = ctx.membreCompteId
        ? await resoudreDeviseDestinataire(app.prisma, ctx.membreCompteId)
        : 'FCFA'

      const { buffer } = await produireRecuPdf(app.prisma, app.blob, ctx, langue, devise)
      const resultat = await envoyerRecuWhatsApp(app.prisma, app.whatsapp, {
        telephone: ctx.membreTelephone,
        membreCompteId: ctx.membreCompteId,
        pdf: buffer,
        meta: {
          nomFichier: `recu-${ctx.donnees.numero}.pdf`,
          legende: t(langue, 'recus.whatsapp.legende', { numero: ctx.donnees.numero }),
        },
      })
      return reply.code(200).send(resultat)
    },
  )

  // POST /recus/:id/annuler — ANNULATION COMPTABLE (le reçu garde son numéro et sa trace).
  // Garde alignée sur les FLUX D'ARGENT (ADMIN/PRESIDENT/TRESORIERE), comme les dons/reversements
  // et les encaissements : annuler un reçu libère la modification et la suppression du versement.
  app.post<{ Params: { id: string }; Body: { motif?: string } }>(
    '/recus/:id/annuler',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { motif: { type: 'string', maxLength: 500 } },
        },
      },
      preHandler: [authenticate, requireRoles(['ADMIN', 'PRESIDENT', 'TRESORIERE'])],
    },
    async (req, reply) => {
      try {
        const recu = await annulerRecu(
          app.prisma,
          req.params.id,
          req.user.sub ?? '',
          req.body?.motif,
        )
        return reply.code(200).send(recu)
      } catch (err) {
        if (err instanceof RecuIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found' })
        }
        if (err instanceof RecuDejaAnnuleError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: t(langueDeRequete(req), 'recus.dejaAnnule'),
          })
        }
        throw err
      }
    },
  )
}

export default recusRoutes
