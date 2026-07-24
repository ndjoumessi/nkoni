import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { t, langueDeRequete } from '../lib/i18n'
import { validerImageTeleversee } from '../lib/upload-image'

/**
 * Avatar de COMPTE — self-service (§4.11 bis). Distinct de la photo de MEMBRE (`/moi/photo`, qui
 * alimente la carte/PDF) : ici la photo est portée par `Utilisateur`, donc TOUT compte connecté peut
 * en avoir un — y compris un compte purement administratif SANS fiche membre. Résolu depuis
 * `req.user.sub` (aucun id d'URL → pas d'IDOR). Mêmes garde-fous que la photo de membre : JPEG/PNG,
 * magic bytes, ≤ 5 Mo, Blob PRIVÉ (l'URL n'est jamais exposée — lecture via ce proxy authentifié).
 *
 * `Utilisateur.photoBlobUrl`/`photoMime` sont NOUVEAUX : le client Prisma généré ne les connaît qu'après
 * `migrate dev`. On type donc l'accès en surface souple (compile-avant-regen, comme le paiement) ; les
 * lectures ne SÉLECTIONNENT que les champs photo → jamais de `passwordHash` renvoyé (règle Utilisateur).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface DelegateUtilisateurPhoto {
  findUnique(args: any): Promise<{ photoBlobUrl: string | null; photoMime: string | null } | null>
  update(args: any): Promise<unknown>
}

export const moiAvatarRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const utilisateur = () => app.prisma.utilisateur as unknown as DelegateUtilisateurPhoto

  const lire = async (sub: string | undefined) => {
    if (!sub) return null
    return utilisateur().findUnique({ where: { id: sub }, select: { photoBlobUrl: true, photoMime: true } })
  }

  // POST /moi/avatar — le compte téléverse SON avatar (multipart, 1 image JPEG/PNG).
  app.post('/moi/avatar', { preHandler: [authenticate] }, async (req, reply) => {
    const compte = await lire(req.user.sub)
    if (!compte) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.introuvable') })

    let fichier: { buffer: Buffer; mimetype: string } | undefined
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') fichier = { buffer: await part.toBuffer(), mimetype: part.mimetype }
      }
    } catch {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.tropVolumineux') })
    }
    if (!fichier) return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.aucunFichier') })
    // Validation PARTAGÉE avec les routes de photo de membre (allowlist MIME + magic bytes + plafond).
    const refus = validerImageTeleversee(fichier)
    if (refus === 'TYPE_INVALIDE') {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.typeInvalide') })
    }
    if (refus === 'TROP_VOLUMINEUX') {
      return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'photoMembre.tropVolumineux') })
    }

    // Remplace l'ancien avatar (best-effort : ne bloque pas si la suppression du blob échoue).
    if (compte.photoBlobUrl) {
      await app.blob.del(compte.photoBlobUrl).catch(() => undefined)
    }
    const { url } = await app.blob.put('utilisateurs/avatar', fichier.buffer, { contentType: fichier.mimetype })
    await utilisateur().update({ where: { id: req.user.sub }, data: { photoBlobUrl: url, photoMime: fichier.mimetype } })
    return reply.code(201).send({ ok: true })
  })

  // GET /moi/avatar — proxy authentifié de SON avatar (store PRIVÉ).
  app.get('/moi/avatar', { preHandler: [authenticate] }, async (req, reply) => {
    const compte = await lire(req.user.sub)
    if (!compte || !compte.photoBlobUrl) {
      return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.aucunePhoto') })
    }
    const buffer = await app.blob.lireContenu(compte.photoBlobUrl)
    if (!buffer) return reply.code(502).send({ error: 'Bad Gateway', message: t(langueDeRequete(req), 'photoMembre.indisponible') })
    reply.header('Content-Type', compte.photoMime ?? 'image/jpeg')
    reply.header('Cache-Control', 'private, no-cache')
    return reply.send(buffer)
  })

  // DELETE /moi/avatar — le compte retire SON avatar (Blob + champs).
  app.delete('/moi/avatar', { preHandler: [authenticate] }, async (req, reply) => {
    const compte = await lire(req.user.sub)
    if (!compte) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'photoMembre.introuvable') })
    if (compte.photoBlobUrl) {
      await app.blob.del(compte.photoBlobUrl).catch(() => undefined)
      await utilisateur().update({ where: { id: req.user.sub }, data: { photoBlobUrl: null, photoMime: null } })
    }
    return reply.code(204).send()
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default moiAvatarRoutes
