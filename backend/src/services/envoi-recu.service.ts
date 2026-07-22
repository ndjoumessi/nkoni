import {
  envoyerRecuWhatsApp,
  type WhatsAppClient,
  type WhatsAppPrisma,
  type WhatsAppMeta,
  type ResultatEnvoiRecu,
} from './whatsapp.service'
import {
  envoyerRecuEmail,
  type EmailClient,
  type EmailPrisma,
  type EmailMeta,
  type ResultatEnvoiRecuEmail,
} from './email.service'

/**
 * Orchestrateur d'envoi d'un reçu (§4.6, bloquant GA 0.4) — WhatsApp d'ABORD, EMAIL en REPLI.
 *
 * Le repli n'est tenté QUE si WhatsApp n'a pas délivré (canal indisponible faute de compte Meta,
 * numéro absent/invalide, ou échec réseau). Chaque canal est best-effort et ne lève jamais ; cette
 * fonction non plus. Elle renvoie le canal qui a réussi et le détail par canal, pour que la route
 * puisse informer l'utilisateur (« envoyé par email ») ou expliquer un non-envoi.
 *
 * Ordre WhatsApp → email et non l'inverse : WhatsApp est le canal PRIMAIRE du produit (usage
 * courant chez les membres, lecture immédiate) ; l'email est le filet quand il manque.
 */

export type CanalEnvoiRecu = 'whatsapp' | 'email'

export interface ResultatEnvoiRecuMulti {
  envoye: boolean
  /** Canal ayant délivré, `null` si aucun. */
  canal: CanalEnvoiRecu | null
  whatsapp: ResultatEnvoiRecu
  /** `nonTente` = WhatsApp a délivré, le repli n'avait pas lieu d'être. */
  email: ResultatEnvoiRecuEmail | { envoye: false; raison: 'nonTente' }
}

export async function envoyerRecu(
  prisma: WhatsAppPrisma & EmailPrisma,
  clients: { whatsapp: WhatsAppClient; email: EmailClient },
  params: {
    telephone: string | null
    email: string | null
    membreCompteId: string | null
    pdf: Buffer
    metaWhatsApp: WhatsAppMeta
    metaEmail: EmailMeta
  },
): Promise<ResultatEnvoiRecuMulti> {
  const whatsapp = await envoyerRecuWhatsApp(prisma, clients.whatsapp, {
    telephone: params.telephone,
    membreCompteId: params.membreCompteId,
    pdf: params.pdf,
    meta: params.metaWhatsApp,
  })
  if (whatsapp.envoye) {
    return { envoye: true, canal: 'whatsapp', whatsapp, email: { envoye: false, raison: 'nonTente' } }
  }

  const email = await envoyerRecuEmail(prisma, clients.email, {
    email: params.email,
    membreCompteId: params.membreCompteId,
    pdf: params.pdf,
    meta: params.metaEmail,
  })
  return { envoye: email.envoye, canal: email.envoye ? 'email' : null, whatsapp, email }
}
