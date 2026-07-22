import { API_URL, leverSiErreur, request, rid } from './core'

/* -------------------------------------------------------------------------- */
/* Reçus (§4.6)                                                              */
/* -------------------------------------------------------------------------- */

export interface Recu {
  id: string
  /**
   * `null` = reçu ORPHELIN : son versement a été supprimé après annulation du reçu. La ligne
   * survit (sans quoi son numéro serait réutilisé) et reste affichable grâce au snapshot
   * ci-dessous. Un reçu orphelin est TOUJOURS annulé — c'est la condition de la suppression.
   */
  versementId: string | null
  numero: string
  genereParId: string
  dateGeneration: string
  urlPdf: string | null
  /** `null` = reçu ACTIF. Renseigné ⇒ annulé (le numéro et la trace sont conservés). */
  annuleLe: string | null
  /** Jeton signé du lien PUBLIC de téléchargement (partage WhatsApp), fourni par le backend. */
  signaturePartage: string

  /**
   * SNAPSHOT figé à la génération. Ces valeurs viennent du versement au moment de l'émission,
   * et sont la SEULE source d'affichage une fois le reçu orphelin. Ne pas les recalculer depuis
   * le versement : il peut ne plus exister, et son montant a pu changer depuis.
   */
  membreId: string
  montant: number
  dateVersement: string
  annee: number
  mode: string
}

/** Canal ayant délivré un reçu, `null` si aucun (cf. orchestrateur backend). */
export type CanalEnvoiRecu = 'whatsapp' | 'email'

/** Résultat de l'envoi multi-canal (§4.6, GA 0.4) : WhatsApp d'abord, email en repli. */
export interface ResultatEnvoiRecu {
  envoye: boolean
  canal: CanalEnvoiRecu | null
  whatsapp: { envoye: boolean; raison?: string }
  email: { envoye: boolean; raison?: string }
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
  /**
   * ANNULE un reçu (annulation comptable, jamais une suppression). Débloque la modification et la
   * suppression du versement source, et permet de réémettre un reçu corrigé (nouveau numéro).
   */
  annuler: (recuId: string, accessToken: string, motif?: string) =>
    request<Recu>(`/recus/${recuId}/annuler`, {
      method: 'POST',
      json: motif ? { motif } : {},
      accessToken,
    }),
  envoyerWhatsApp: (recuId: string, accessToken: string) =>
    request<{ envoye: boolean; raison?: string }>(`/recus/${rid(recuId)}/whatsapp`, {
      method: 'POST',
      accessToken,
    }),
  /**
   * Envoie le reçu au membre par le MEILLEUR canal disponible : WhatsApp d'abord, EMAIL en repli
   * (§4.6, GA 0.4). Best-effort côté serveur : renvoie le canal ayant délivré (`null` si aucun).
   */
  envoyer: (recuId: string, accessToken: string) =>
    request<ResultatEnvoiRecu>(`/recus/${rid(recuId)}/envoyer`, {
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
