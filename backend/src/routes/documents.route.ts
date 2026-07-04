import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import {
  televerserDocument,
  listerDocumentsVisibles,
  supprimerDocument,
  getDocumentPourTelechargement,
  DocumentIntrouvableError,
  AccesDocumentRefuseError,
  EntiteParenteIntrouvableError,
  TypeFichierNonAutoriseError,
  FichierTropVolumineuxError,
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

function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof DocumentIntrouvableError || err instanceof EntiteParenteIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  if (err instanceof AccesDocumentRefuseError) {
    reply.code(403).send({ error: 'Forbidden', message: err.message })
    return true
  }
  if (err instanceof TypeFichierNonAutoriseError || err instanceof FichierTropVolumineuxError) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  return false
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
      try {
        const { url, typeFichier, nom } = await getDocumentPourTelechargement(
          app.prisma,
          req.params.id,
          demandeur(req),
        )
        const amont = await fetch(url)
        if (!amont.ok) {
          return reply.code(502).send({ error: 'Bad Gateway', message: 'Fichier indisponible.' })
        }
        const buffer = Buffer.from(await amont.arrayBuffer())
        reply.header('Content-Type', typeFichier)
        reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(nom)}"`)
        return reply.send(buffer)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
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
        .send({ error: 'Bad Request', message: 'Fichier trop volumineux (10 Mo maximum).' })
    }

    if (!fichier) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Aucun fichier fourni.' })
    }
    const entiteType = fields['entiteType'] as EntiteDocument | undefined
    const entiteId = fields['entiteId']
    const nom = fields['nom']?.trim() || fichier.filename
    if (!entiteType || !ENTITES.includes(entiteType) || !entiteId || !nom) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Champs requis manquants ou invalides (entiteType, entiteId, nom).',
      })
    }

    try {
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
      )
      return reply.code(201).send(cree)
    } catch (err) {
      if (reply4xxSiMetier(err, reply)) return
      throw err
    }
  })

  // DELETE /documents/:id — retire du Blob ET de la DB.
  app.delete<{ Params: { id: string } }>(
    '/documents/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      try {
        await supprimerDocument(app.prisma, app.blob, req.params.id, demandeur(req))
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default documentsRoutes
