import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { t, langueDeRequete } from '../lib/i18n'
import {
  verifierQuotaStockage,
} from '../services/capacites-organisation.service'
import {
  televerserDocument,
  listerDocumentsVisibles,
  supprimerDocument,
  getDocumentPourTelechargement,
  type DemandeurDocument,
  type EntiteDocument,
} from '../services/document.service'

/**
 * V2 (§5) — Documents / archives.
 *
 *   - POST   /documents               → multipart (fichier + nom/description/entiteType/entiteId)
 *   - GET    /documents?entiteType&entiteId → liste filtrée par peutVoirDocument
 *   - GET    /documents/:id/contenu   → proxy de téléchargement (applique peutVoirDocument ;
 *                                        l'URL blob n'est jamais exposée au client)
 *   - DELETE /documents/:id           → retire du Blob ET de la DB
 *
 * Toutes en `authenticate` : l'autorisation fine (voir/gérer, héritée du parent) est
 * appliquée dans le service. GET /:id/contenu et GET|DELETE non autorisés → 404
 * (comme les conflits : ne pas divulguer l'existence d'un document confidentiel).
 */

const ENTITES: EntiteDocument[] = ['MEMBRE', 'REUNION', 'CONFLIT', 'COMMEMORATION']

const listQuerystring = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      entiteType: { type: 'string', enum: ENTITES },
      entiteId: { type: 'string', maxLength: 64 },
    },
  },
} as const

function demandeur(req: FastifyRequest): DemandeurDocument {
  return { role: req.user.role, ...(req.user.sub !== undefined ? { id: req.user.sub } : {}) }
}

export const documentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /documents — liste filtrée (visibilité héritée du parent).
  app.get<{ Querystring: { entiteType?: EntiteDocument; entiteId?: string } }>(
    '/documents',
    { schema: listQuerystring, preHandler: [authenticate] },
    async (req) => {
      const filtre: { entiteType?: EntiteDocument; entiteId?: string } = {}
      if (req.query.entiteType) filtre.entiteType = req.query.entiteType
      if (req.query.entiteId) filtre.entiteId = req.query.entiteId
      return listerDocumentsVisibles(app.prisma, demandeur(req), filtre)
    },
  )

  // GET /documents/:id/contenu — proxy de téléchargement authentifié.
  app.get<{ Params: { id: string } }>(
    '/documents/:id/contenu',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { url, typeFichier, nom } = await getDocumentPourTelechargement(
        app.prisma,
        req.params.id,
        demandeur(req),
      )
      // Store PRIVÉ : lecture authentifiée par token (jamais un fetch d'URL publique).
      const buffer = await app.blob.lireContenu(url)
      if (!buffer) {
        return reply
          .code(502)
          .send({ error: 'Bad Gateway', message: t(langueDeRequete(req), 'documents.fichierIndisponible') })
      }
      reply.header('Content-Type', typeFichier)
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(nom)}"`)
      return reply.send(buffer)
    },
  )

  // POST /documents — téléversement multipart.
  app.post('/documents', { preHandler: [authenticate] }, async (req, reply) => {
    const fields: Record<string, string> = {}
    let fichier: { buffer: Buffer; mimetype: string; filename: string } | undefined

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer()
          fichier = { buffer, mimetype: part.mimetype, filename: part.filename }
        } else {
          fields[part.fieldname] = String(part.value)
        }
      }
    } catch {
      // Dépassement de la limite de taille au parsing multipart.
      return reply
        .code(400)
        .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'documents.fichierTropVolumineux') })
    }

    if (!fichier) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'documents.aucunFichier') })
    }
    const entiteType = fields['entiteType'] as EntiteDocument | undefined
    const entiteId = fields['entiteId']
    const nom = fields['nom']?.trim() || fichier.filename
    if (!entiteType || !ENTITES.includes(entiteType) || !entiteId || !nom) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: t(langueDeRequete(req), 'documents.champsRequisManquants'),
      })
    }

    // Quota de stockage du forfait EFFECTIF (spec 1.1 §3.3) — contrôlé PAR le service, APRÈS
    // l'autorisation (étape 3) et AVANT l'envoi au Blob (étape 4) : un rôle non autorisé ou un
    // type de fichier invalide ne doit jamais apprendre l'usage de stockage de l'organisation.
    const organisationId = req.user.organisationId
    const verifierQuota = organisationId
      ? (tailleOctets: number) =>
          verifierQuotaStockage(
            app.prisma as unknown as Parameters<typeof verifierQuotaStockage>[0],
            organisationId,
            tailleOctets,
          )
      : undefined

    const cree = await televerserDocument(
      app.prisma,
      app.blob,
      {
        nom,
        ...(fields['description'] ? { description: fields['description'] } : {}),
        entiteType,
        entiteId,
        fichier: { buffer: fichier.buffer, mimetype: fichier.mimetype },
      },
      demandeur(req),
      verifierQuota,
    )
    return reply.code(201).send(cree)
  })

  // DELETE /documents/:id — retire du Blob ET de la DB.
  app.delete<{ Params: { id: string } }>(
    '/documents/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      await supprimerDocument(app.prisma, app.blob, req.params.id, demandeur(req))
      return reply.code(204).send()
    },
  )
}

export default documentsRoutes
