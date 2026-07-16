import { API_URL, leverSiErreur, request, rid } from './core'

/* -------------------------------------------------------------------------- */
/* Reçus (§4.6)                                                              */
/* -------------------------------------------------------------------------- */

export interface Recu {
  id: string
  versementId: string
  numero: string
  genereParId: string
  dateGeneration: string
  urlPdf: string | null
  /** Jeton signé du lien PUBLIC de téléchargement (partage WhatsApp), fourni par le backend. */
  signaturePartage: string
}

export const recusApi = {
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Recu[]>(`/recus?membreId=${encodeURIComponent(membreId)}`, { accessToken, signal }),
  generer: (versementId: string, accessToken: string) =>
    request<Recu>(`/versements/${encodeURIComponent(versementId)}/recu`, {
      method: 'POST',
      accessToken,
    }),
  /** Télécharge le PDF du reçu via le proxy authentifié (généré à la demande, Blob privé). */
  telecharger: async (recuId: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/recus/${rid(recuId)}/pdf`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Envoie le reçu au membre par WhatsApp (best-effort côté serveur, Meta Cloud API). */
  envoyerWhatsApp: (recuId: string, accessToken: string) =>
    request<{ envoye: boolean; raison?: string }>(`/recus/${rid(recuId)}/whatsapp`, {
      method: 'POST',
      accessToken,
    }),
  /**
   * URL PUBLIQUE ABSOLUE de téléchargement du reçu (lien à partager, ex. via `wa.me`). Passe par
   * le proxy `/api/*` same-origin en prod ; `new URL(..., origin)` la rend absolue quel que soit
   * `API_URL` (relatif `/api` en prod, absolu en dev). Le membre télécharge sans compte : c'est
   * la signature qui autorise (cf. backend `GET /recus/:id/pdf-public`).
   */
  urlPartage: (recu: Recu): string =>
    new URL(
      `${API_URL}/recus/${rid(recu.id)}/pdf-public?t=${encodeURIComponent(recu.signaturePartage)}`,
      window.location.origin,
    ).href,
}
