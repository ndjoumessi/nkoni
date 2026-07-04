import { put, del } from '@vercel/blob'
import type { BlobClient } from '../services/document.service'

/**
 * Implémentation réelle du BlobClient sur Vercel Blob.
 *
 * Le token est lu par @vercel/blob depuis la variable d'environnement
 * BLOB_READ_WRITE_TOKEN (à définir sur Railway). Les blobs sont stockés en `public`
 * avec un suffixe aléatoire, mais l'URL n'est JAMAIS renvoyée au client : le
 * téléchargement passe par le proxy authentifié GET /documents/:id/contenu qui applique
 * peutVoirDocument (cf. document.service.ts).
 */
export const vercelBlobClient: BlobClient = {
  async put(pathname, data, opts) {
    const res = await put(pathname, data, {
      access: 'public',
      contentType: opts.contentType,
      addRandomSuffix: true,
    })
    return { url: res.url }
  },
  async del(url) {
    await del(url)
  },
}
