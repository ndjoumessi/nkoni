import { typeActif } from './notification.service'
import { normaliserEmail } from '../lib/email-adresse'

/**
 * Envoi EMAIL d'un document (reçu PDF) — canal de REPLI du WhatsApp (§4.6, bloquant GA 0.4).
 * Fournisseur : Resend (API HTTP simple, pièce jointe en base64). BEST-EFFORT : n'échoue JAMAIS
 * la génération du reçu (toute erreur est avalée).
 *
 * Client MOCKABLE (`EmailClient`), au même titre que `WhatsAppClient`/`BlobClient` : la config
 * réelle (`RESEND_API_KEY`, `RESEND_FROM`) n'est lue que par `vraiEmailClient` ; en test on injecte
 * un mock (aucun réseau). Sans config env, le client réel est un NO-OP (`disponible=false`) —
 * l'envoi est simplement ignoré, exactement comme WhatsApp sans compte Meta.
 */

export interface EmailMeta {
  nomFichier: string
  sujet: string
  corps: string
}

export interface EmailClient {
  /** La config est-elle présente (clé API + adresse d'expédition) ? */
  disponible(): boolean
  /** Envoie le PDF en pièce jointe à l'adresse. Renvoie `{ ok }` ; NE LÈVE PAS (best-effort géré ici). */
  envoyerDocument(email: string, pdf: Buffer, meta: EmailMeta): Promise<{ ok: boolean }>
}

const RESEND_API = 'https://api.resend.com/emails'

/** Client réel Resend : POST /emails avec pièce jointe base64. No-op sans config. */
export const vraiEmailClient: EmailClient = {
  disponible() {
    return Boolean(process.env['RESEND_API_KEY'] && process.env['RESEND_FROM'])
  },
  async envoyerDocument(email, pdf, meta) {
    const cle = process.env['RESEND_API_KEY']
    const expediteur = process.env['RESEND_FROM']
    if (!cle || !expediteur) return { ok: false }
    try {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: expediteur,
          to: [email],
          subject: meta.sujet,
          text: meta.corps,
          attachments: [{ filename: meta.nomFichier, content: pdf.toString('base64') }],
        }),
      })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EmailPrisma {
  utilisateur: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type RaisonNonEnvoiEmail =
  | 'sansEmail'
  | 'emailInvalide'
  | 'desactive'
  | 'clientIndisponible'
  | 'echecEnvoi'
export interface ResultatEnvoiRecuEmail {
  envoye: boolean
  raison?: RaisonNonEnvoiEmail
}

/**
 * Envoie le PDF d'un reçu au membre par email, en respectant : présence d'une adresse, la
 * préférence `notificationsActives` (type VERSEMENT_RECU) du membre, et la disponibilité du client.
 * L'adresse est reçue en PARAMÈTRE (comme le téléphone pour WhatsApp) : ce service ne lit pas
 * `Membre.email` lui-même. BEST-EFFORT : ne lève jamais.
 */
export async function envoyerRecuEmail(
  prisma: EmailPrisma,
  email: EmailClient,
  params: {
    email: string | null
    membreCompteId: string | null
    pdf: Buffer
    meta: EmailMeta
  },
): Promise<ResultatEnvoiRecuEmail> {
  try {
    if (!params.email) return { envoye: false, raison: 'sansEmail' }
    // Normalisation AVANT tout envoi : une adresse non retenue n'est jamais transmise.
    const adresse = normaliserEmail(params.email)
    if (!adresse) return { envoye: false, raison: 'emailInvalide' }
    if (!email.disponible()) return { envoye: false, raison: 'clientIndisponible' }

    // Préférence du membre (VERSEMENT_RECU) — même règle que WhatsApp : on respecte le refus.
    if (params.membreCompteId) {
      const u = await prisma.utilisateur.findUnique({
        where: { id: params.membreCompteId },
        select: { notificationsActives: true },
      })
      if (!typeActif(u?.notificationsActives, 'VERSEMENT_RECU')) {
        return { envoye: false, raison: 'desactive' }
      }
    }

    const res = await email.envoyerDocument(adresse, params.pdf, params.meta)
    return res.ok ? { envoye: true } : { envoye: false, raison: 'echecEnvoi' }
  } catch {
    return { envoye: false, raison: 'echecEnvoi' }
  }
}
