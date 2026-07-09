import { typeActif } from './notification.service'

/**
 * Envoi WhatsApp d'un document (reçu PDF) — Meta WhatsApp Cloud API. BEST-EFFORT : n'échoue
 * JAMAIS la génération du reçu (toute erreur est avalée et journalisée).
 *
 * Client MOCKABLE (`WhatsAppClient`) : la config réelle (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) n'est
 * lue que par `vraiWhatsAppClient` ; en test on injecte un mock (aucun réseau). Sans config env,
 * le client réel est un NO-OP (`disponible=false`) — l'envoi est simplement ignoré.
 */

export interface WhatsAppMeta {
  nomFichier: string
  legende: string
}

export interface WhatsAppClient {
  /** La config est-elle présente (token + phone id) ? */
  disponible(): boolean
  /** Envoie le PDF au numéro. Renvoie `{ ok }` ; NE LÈVE PAS (best-effort géré ici). */
  envoyerDocument(telephone: string, pdf: Buffer, meta: WhatsAppMeta): Promise<{ ok: boolean }>
}

const API_BASE = 'https://graph.facebook.com/v20.0'

/** Client réel Meta Cloud API : upload media → envoi message document. No-op sans config. */
export const vraiWhatsAppClient: WhatsAppClient = {
  disponible() {
    return Boolean(process.env['WHATSAPP_TOKEN'] && process.env['WHATSAPP_PHONE_ID'])
  },
  async envoyerDocument(telephone, pdf, meta) {
    const token = process.env['WHATSAPP_TOKEN']
    const phoneId = process.env['WHATSAPP_PHONE_ID']
    if (!token || !phoneId) return { ok: false }
    try {
      // 1. Upload du média (PDF) → mediaId.
      const form = new FormData()
      form.append('messaging_product', 'whatsapp')
      form.append('type', 'application/pdf')
      form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), meta.nomFichier)
      const up = await fetch(`${API_BASE}/${phoneId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!up.ok) return { ok: false }
      const { id: mediaId } = (await up.json()) as { id?: string }
      if (!mediaId) return { ok: false }

      // 2. Envoi du message document (pièce jointe + légende).
      const msg = await fetch(`${API_BASE}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telephone,
          type: 'document',
          document: { id: mediaId, filename: meta.nomFichier, caption: meta.legende },
        }),
      })
      return { ok: msg.ok }
    } catch {
      return { ok: false }
    }
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WhatsAppPrisma {
  utilisateur: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type RaisonNonEnvoi = 'sansTelephone' | 'desactive' | 'clientIndisponible' | 'echecEnvoi'
export interface ResultatEnvoiRecu {
  envoye: boolean
  raison?: RaisonNonEnvoi
}

/**
 * Envoie le PDF d'un reçu au membre par WhatsApp, en respectant : présence d'un téléphone, la
 * préférence `notificationsActives` (type VERSEMENT_RECU) du membre, et la disponibilité du client.
 * BEST-EFFORT : ne lève jamais.
 */
export async function envoyerRecuWhatsApp(
  prisma: WhatsAppPrisma,
  whatsapp: WhatsAppClient,
  params: {
    telephone: string | null
    membreCompteId: string | null
    pdf: Buffer
    meta: WhatsAppMeta
  },
): Promise<ResultatEnvoiRecu> {
  try {
    if (!params.telephone) return { envoye: false, raison: 'sansTelephone' }
    if (!whatsapp.disponible()) return { envoye: false, raison: 'clientIndisponible' }

    // Préférence du membre (VERSEMENT_RECU = notifications liées à un versement/reçu).
    if (params.membreCompteId) {
      const u = await prisma.utilisateur.findUnique({
        where: { id: params.membreCompteId },
        select: { notificationsActives: true },
      })
      if (!typeActif(u?.notificationsActives, 'VERSEMENT_RECU')) {
        return { envoye: false, raison: 'desactive' }
      }
    }

    const res = await whatsapp.envoyerDocument(params.telephone, params.pdf, params.meta)
    return res.ok ? { envoye: true } : { envoye: false, raison: 'echecEnvoi' }
  } catch {
    // Best-effort : une erreur ne doit jamais remonter.
    return { envoye: false, raison: 'echecEnvoi' }
  }
}
