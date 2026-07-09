import { put, del, get } from '@vercel/blob'
import type { BlobClient } from '../services/document.service'

/**
 * Implémentation réelle du BlobClient sur Vercel Blob.
 *
 * Le token est lu par @vercel/blob depuis la variable d'environnement BLOB_READ_WRITE_TOKEN
 * (définie sur Railway). Le store est configuré en **PRIVATE** (documents familiaux
 * potentiellement sensibles) : les blobs sont donc écrits en `access: 'private'` et leur URL
 * n'est JAMAIS publiquement accessible ni renvoyée au client. Le téléchargement passe par le
 * proxy authentifié GET /documents/:id/contenu, qui applique `peutVoirDocument` puis lit le
 * contenu via `lireContenu` (requête authentifiée par token, cf. @vercel/blob `get`).
 */
export const vercelBlobClient: BlobClient = {
  async put(pathname, data, opts) {
    const res = await put(pathname, data, {
      access: 'private',
      contentType: opts.contentType,
      addRandomSuffix: true,
    })
    return { url: res.url }
  },
  async del(url) {
    await del(url)
  },
  async lireContenu(url) {
    // `get` avec `access: 'private'` authentifie la lecture par le token (pas d'URL publique).
    // Renvoie un stream (200) ou null (blob absent) ; statusCode 304 → stream null (on ignore).
    const res = await get(url, { access: 'private' })
    if (!res || res.statusCode !== 200 || !res.stream) return null
    return Buffer.from(await new Response(res.stream).arrayBuffer())
  },
}
