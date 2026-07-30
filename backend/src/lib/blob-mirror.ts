/**
 * Miroir hors-site des fichiers Blob (dette GA D2). Les reçus PDF se régénèrent depuis la base
 * (`produireRecuPdf`), mais les **documents** et les **photos** (membres + avatars de compte) sont
 * des TÉLÉVERSEMENTS : perdus si le store Vercel Blob disparaît, ils ne se reconstruisent pas. Ce
 * module fournit la logique PURE qui liste les fichiers à sauvegarder ; le script `prisma/mirror-
 * blobs.ts` fait les I/O (téléchargement + écriture disque) et le workflow pousse vers R2.
 *
 * Pourquoi la BASE est la source de vérité (et non le store) : `BlobClient` n'a pas de `list()`, et
 * les pathnames ne sont pas préfixés par organisation. La seule façon fiable d'énumérer les blobs
 * VIVANTS (non orphelins) est de lire les colonnes qui les référencent : `Document.url`,
 * `Membre.photoBlobUrl`, `Utilisateur.photoBlobUrl`. Un blob non référencé est un orphelin — inutile
 * de le sauvegarder.
 */

export interface CibleBlob {
  /** URL Blob (interne, jamais publique) à lire via `BlobClient.lireContenu`. */
  url: string
  /** Chemin relatif STABLE sous lequel archiver le fichier (miroir local puis R2). */
  cheminLocal: string
  source: 'document' | 'photoMembre' | 'avatarUtilisateur'
}

/**
 * Chemin relatif d'archivage dérivé de l'URL Blob = son `pathname` (sans le `/` initial). Les
 * pathnames Vercel Blob sont UNIQUES (`addRandomSuffix`) et IMMUABLES → pas de collision, et un
 * fichier déjà présent à ce chemin est forcément le même blob (⇒ le miroir peut sauter, incrémental).
 */
export function cheminLocalBlob(url: string): string {
  return new URL(url).pathname.replace(/^\/+/, '')
}

/**
 * Construit la liste DÉDUPLIQUÉE des fichiers à sauvegarder à partir des colonnes lues en base.
 * PURE (aucune I/O, aucun Prisma) → testable directement. L'appelant fait les `findMany` (sous
 * `runUnscoped` : maintenance globale, toutes organisations).
 */
export function construireCibles(input: {
  documents: Array<{ url: string }>
  photosMembre: Array<{ photoBlobUrl: string | null }>
  avatars: Array<{ photoBlobUrl: string | null }>
}): CibleBlob[] {
  const cibles: CibleBlob[] = []
  for (const d of input.documents) {
    if (d.url) cibles.push({ url: d.url, cheminLocal: cheminLocalBlob(d.url), source: 'document' })
  }
  for (const m of input.photosMembre) {
    if (m.photoBlobUrl) cibles.push({ url: m.photoBlobUrl, cheminLocal: cheminLocalBlob(m.photoBlobUrl), source: 'photoMembre' })
  }
  for (const u of input.avatars) {
    if (u.photoBlobUrl) cibles.push({ url: u.photoBlobUrl, cheminLocal: cheminLocalBlob(u.photoBlobUrl), source: 'avatarUtilisateur' })
  }
  // Dédoublonnage par URL : une même URL (improbable mais possible entre sources) n'est copiée qu'une fois.
  const vues = new Set<string>()
  return cibles.filter((c) => (vues.has(c.url) ? false : (vues.add(c.url), true)))
}
