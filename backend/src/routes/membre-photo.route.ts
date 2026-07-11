import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { langueDeRequete } from '../lib/i18n'

/**
 * Photo du membre (§4.11) — stockée sur le Blob PRIVÉ (comme les documents/reçus) : l'URL interne
 * n'est JAMAIS renvoyée au client. Téléversement multipart (JPEG/PNG uniquement, pour un rendu
 * fiable sur la carte PDF), lecture via un PROXY AUTHENTIFIÉ. Écritures scopées tenant (extension).
 *
 * Accès : téléversement/suppression = rôles pouvant modifier un Membre (matrice `Membre`/update) ;
 * lecture = rôles `Membre`/read, MEMBRE_SIMPLE limité à SA propre fiche (404 sinon). La photo
 * n'apparaît PAS sur la page publique de statut (PII fort) — uniquement dans l'app + la carte.
 */

const MIMES_AUTORISES = ['image/jpeg', 'image/png'] as const
const TAILLE_MAX = 5 * 1024 * 1024 // 5 Mo

type Langue = 'FR' | 'EN'
const MSG = {
  introuvable: { FR: 'Membre introuvable.', EN: 'Member not found.' },
  aucunFichier: { FR: 'Aucun fichier reçu.', EN: 'No file received.' },
  typeInvalide: { FR: 'Format non supporté (JPEG ou PNG uniquement).', EN: 'Unsupported format (JPEG or PNG only).' },
  tropVolumineux: { FR: 'Image trop volumineuse (max 5 Mo).', EN: 'Image too large (max 5 MB).' },
  indisponible: { FR: 'Photo indisponible.', EN: 'Photo unavailable.' },
  aucunePhoto: { FR: 'Aucune photo.', EN: 'No photo.' },
} as const

export const membrePhotoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const msg = (req: FastifyRequest, k: keyof typeof MSG): string => {
    const langue = langueDeRequete(req) as Langue
    return MSG[k][langue] ?? MSG[k].FR
  }

  // POST /membres/:id/photo — téléversement (multipart, 1 image JPEG/PNG).
  app.post<{ Params: { id: string } }>(
    '/membres/:id/photo',
    { preHandler: [authenticate, requirePermission('Membre', 'update')] },
    async (req, reply) => {
      const membre = await app.prisma.membre.findUnique({
        where: { id: req.params.id },
        select: { id: true, photoBlobUrl: true },
      })
      if (!membre) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })

      let fichier: { buffer: Buffer; mimetype: string } | undefined
      try {
        for await (const part of req.parts()) {
          if (part.type === 'file') fichier = { buffer: await part.toBuffer(), mimetype: part.mimetype }
        }
      } catch {
        return reply.code(400).send({ error: 'Bad Request', message: msg(req, 'tropVolumineux') })
      }
      if (!fichier) return reply.code(400).send({ error: 'Bad Request', message: msg(req, 'aucunFichier') })
      if (!MIMES_AUTORISES.includes(fichier.mimetype as (typeof MIMES_AUTORISES)[number])) {
        return reply.code(400).send({ error: 'Bad Request', message: msg(req, 'typeInvalide') })
      }
      if (fichier.buffer.length > TAILLE_MAX) {
        return reply.code(400).send({ error: 'Bad Request', message: msg(req, 'tropVolumineux') })
      }

      // Remplace l'ancienne photo (best-effort : ne bloque pas si la suppression du blob échoue).
      if (membre.photoBlobUrl) {
        await app.blob.del(membre.photoBlobUrl).catch(() => undefined)
      }
      const { url } = await app.blob.put('membres/photo', fichier.buffer, { contentType: fichier.mimetype })
      await app.prisma.membre.update({
        where: { id: req.params.id },
        data: { photoBlobUrl: url, photoMime: fichier.mimetype },
      })
      return reply.code(201).send({ ok: true })
    },
  )

  // GET /membres/:id/photo — proxy authentifié (store PRIVÉ). MEMBRE_SIMPLE : sa propre photo.
  app.get<{ Params: { id: string } }>(
    '/membres/:id/photo',
    { preHandler: [authenticate, requirePermission('Membre', 'read')] },
    async (req, reply) => {
      const membre = await app.prisma.membre.findUnique({
        where: { id: req.params.id },
        select: { photoBlobUrl: true, photoMime: true, compteUtilisateurId: true },
      })
      if (!membre) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      if (req.user.role === 'MEMBRE_SIMPLE' && membre.compteUtilisateurId !== req.user.sub) {
        return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      }
      if (!membre.photoBlobUrl) {
        return reply.code(404).send({ error: 'Not Found', message: msg(req, 'aucunePhoto') })
      }
      const buffer = await app.blob.lireContenu(membre.photoBlobUrl)
      if (!buffer) return reply.code(502).send({ error: 'Bad Gateway', message: msg(req, 'indisponible') })
      reply.header('Content-Type', membre.photoMime ?? 'image/jpeg')
      reply.header('Cache-Control', 'private, no-cache')
      return reply.send(buffer)
    },
  )

  // DELETE /membres/:id/photo — retire la photo (Blob + champs).
  app.delete<{ Params: { id: string } }>(
    '/membres/:id/photo',
    { preHandler: [authenticate, requirePermission('Membre', 'update')] },
    async (req, reply) => {
      const membre = await app.prisma.membre.findUnique({
        where: { id: req.params.id },
        select: { photoBlobUrl: true },
      })
      if (!membre) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      if (membre.photoBlobUrl) {
        await app.blob.del(membre.photoBlobUrl).catch(() => undefined)
        await app.prisma.membre.update({
          where: { id: req.params.id },
          data: { photoBlobUrl: null, photoMime: null },
        })
      }
      return reply.code(204).send()
    },
  )
}

export default membrePhotoRoutes
