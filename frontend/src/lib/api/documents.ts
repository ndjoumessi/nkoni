import { API_URL, leverSiErreur, request, rid } from './core'

/* Documents / archives (V2 §5) ----------------------------------------------- */

export type EntiteDocument = 'MEMBRE' | 'REUNION' | 'CONFLIT' | 'COMMEMORATION'

/** Métadonnées d'un document (l'URL brute du blob n'est JAMAIS exposée par l'API). */
export interface DocumentMeta {
  id: string
  nom: string
  description: string | null
  typeFichier: string
  tailleOctets: number
  entiteType: EntiteDocument
  entiteId: string
  dateTeleversement: string
  createdAt: string
  televersePar: { id: string; email: string; role: string } | null
}

export interface DocumentUploadInput {
  entiteType: EntiteDocument
  entiteId: string
  nom: string
  description?: string
  file: File
}

export const documentsApi = {
  listByEntite: (
    entiteType: EntiteDocument,
    entiteId: string,
    accessToken: string,
    signal?: AbortSignal,
  ) =>
    request<DocumentMeta[]>(
      `/documents?entiteType=${entiteType}&entiteId=${rid(entiteId)}`,
      { accessToken, signal },
    ),

  remove: (id: string, accessToken: string) =>
    request<void>(`/documents/${rid(id)}`, { method: 'DELETE', accessToken }),

  /** Upload multipart. On laisse le navigateur poser le Content-Type (+ boundary). */
  upload: async (input: DocumentUploadInput, accessToken: string): Promise<DocumentMeta> => {
    const fd = new FormData()
    fd.append('entiteType', input.entiteType)
    fd.append('entiteId', input.entiteId)
    fd.append('nom', input.nom)
    if (input.description) fd.append('description', input.description)
    fd.append('fichier', input.file)
    const res = await fetch(`${API_URL}/documents`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: fd,
    })
    await leverSiErreur(res)
    return (await res.json()) as DocumentMeta
  },

  /**
   * Télécharge le contenu via le proxy authentifié (l'URL blob n'est jamais exposée).
   * Renvoie un Blob ; l'appelant crée une object-URL pour l'afficher / le télécharger.
   */
  telecharger: async (id: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/documents/${rid(id)}/contenu`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
}
