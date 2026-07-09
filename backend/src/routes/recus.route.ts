import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import { t, langueDeRequete } from '../lib/i18n'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { genererRecu, VersementIntrouvableError } from '../services/recu.service'
import { chargerDonneesRecuPdf, produireRecuPdf } from '../services/recu-pdf.service'
import { envoyerRecuWhatsApp } from '../services/whatsapp.service'
import {
  resoudreLangueDestinataire,
  resoudreDeviseDestinataire,
} from '../services/notification.service'

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
        return reply.code(201).send(recu)
      } catch (err) {
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
        return app.prisma.recu.findMany({ where, orderBy: { dateGeneration: 'desc' } })
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

      return app.prisma.recu.findMany({
        where: { versementId: { in: ids } },
        orderBy: { dateGeneration: 'desc' },
      })
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
}

export default recusRoutes
