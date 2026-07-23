import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { t, langueDeRequete } from '../lib/i18n'
import { validerImageTeleversee } from '../lib/upload-image'

/**
 * Photo du membre — variante SELF-SERVICE (§4.11). La route bureau `/membres/:id/photo` réserve
 * l'ÉCRITURE aux rôles `Membre`/update : un MEMBRE_SIMPLE ne pouvait donc PAS modifier sa propre
 * photo. Ces routes /moi/photo résolvent la fiche depuis `req.user.sub` (comme /moi/carte) — aucun
 * id d'URL à manipuler, la classe IDOR est supprimée par construction, et l'écriture reste scopée
 * tenant (extension). Mêmes garde-fous que la route bureau : JPEG/PNG, magic bytes, ≤ 5 Mo, Blob
 * PRIVÉ (l'URL n'est jamais exposée — lecture via ce proxy authentifié).
 */

export const moiPhotoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** Fiche du compte connecté (scopée) — ou null. */
  const fiche = async (sub: string | undefined) => {
    if (!sub) return null
    return app.prisma.membre.findFirst({
      where: { compteUtilisateurId: sub },
      select: { id: true, photoBlobUrl: true, photoMime: true },
    })
  }

  // POST /moi/photo — le membre téléverse SA propre photo (multipart, 1 image JPEG/PNG).
  app.post('/moi/photo', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await fiche(req.user.sub)
    if (!membre) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.introuvable') })

    let fichier: { buffer: Buffer; mimetype: string } | undefined
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') fichier = { buffer: await part.toBuffer(), mimetype: part.mimetype }
      }
    } catch {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.tropVolumineux') })
    }
    if (!fichier) return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.aucunFichier') })
    // Validation PARTAGÉE avec la route bureau (allowlist MIME + magic bytes + plafond).
    const refus = validerImageTeleversee(fichier)
    if (refus === 'TYPE_INVALIDE') {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.typeInvalide') })
    }
    if (refus === 'TROP_VOLUMINEUX') {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.tropVolumineux') })
    }

    // Remplace l'ancienne photo (best-effort : ne bloque pas si la suppression du blob échoue).
    if (membre.photoBlobUrl) {
      await app.blob.del(membre.photoBlobUrl).catch(() => undefined)
    }
    const { url } = await app.blob.put('membres/photo', fichier.buffer, { contentType: fichier.mimetype })
    await app.prisma.membre.update({
      where: { id: membre.id },
      data: { photoBlobUrl: url, photoMime: fichier.mimetype },
    })
    return reply.code(201).send({ ok: true })
  })

  // GET /moi/photo — proxy authentifié de SA photo (store PRIVÉ).
  app.get('/moi/photo', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await fiche(req.user.sub)
    if (!membre || !membre.photoBlobUrl) {
      return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.aucunePhoto') })
    }
    const buffer = await app.blob.lireContenu(membre.photoBlobUrl)
    if (!buffer) return reply.code(502).send({ error: 'Bad Gateway', message: t(langueDeRequete(req), 'photoMembre.indisponible') })
    reply.header('Content-Type', membre.photoMime ?? 'image/jpeg')
    reply.header('Cache-Control', 'private, no-cache')
    return reply.send(buffer)
  })

  // DELETE /moi/photo — le membre retire SA photo (Blob + champs).
  app.delete('/moi/photo', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await fiche(req.user.sub)
    if (!membre) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.introuvable') })
    if (membre.photoBlobUrl) {
      await app.blob.del(membre.photoBlobUrl).catch(() => undefined)
      await app.prisma.membre.update({
        where: { id: membre.id },
        data: { photoBlobUrl: null, photoMime: null },
      })
    }
    return reply.code(204).send()
  })
}

export default moiPhotoRoutes
