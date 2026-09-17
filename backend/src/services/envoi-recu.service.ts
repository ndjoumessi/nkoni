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

/** Sous-ensemble d'`ObservabiliteClient` suffisant ici (même parti pris que `PushObservabilite`). */
export interface EnvoiObservabilite {
  signaler(erreur: unknown, contexte: { source: string; [cle: string]: unknown }): void
}

/**
 * Un canal CONFIGURÉ qui refuse l'envoi est un incident : sans ce signalement, l'échec était
 * totalement muet (les clients avalent l'erreur pour ne jamais faire échouer l'opération métier) —
 * c'est ainsi qu'un domaine d'envoi expiré a pu rester invisible. Un canal NON configuré ne signale
 * rien : c'est un état connu, déjà couvert par l'avertissement de démarrage de `lib/env.ts`.
 * Contexte volontairement SANS donnée personnelle : ni adresse, ni numéro, ni identifiant de membre.
 */
function signalerEchecCanal(
  observabilite: EnvoiObservabilite | undefined,
  canal: CanalEnvoiRecu,
  raison: string | undefined,
): void {
  if (!observabilite || raison !== 'echecEnvoi') return
  observabilite.signaler(new Error(`Envoi de reçu échoué (${canal})`), {
    source: 'envoi',
    canal,
    envoi: 'recu',
  })
}

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
  clients: { whatsapp: WhatsAppClient; email: EmailClient; observabilite?: EnvoiObservabilite },
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
  signalerEchecCanal(clients.observabilite, 'whatsapp', whatsapp.raison)

  const email = await envoyerRecuEmail(prisma, clients.email, {
    email: params.email,
    membreCompteId: params.membreCompteId,
    pdf: params.pdf,
    meta: params.metaEmail,
  })
  if (!email.envoye) signalerEchecCanal(clients.observabilite, 'email', email.raison)
  return { envoye: email.envoye, canal: email.envoye ? 'email' : null, whatsapp, email }
}
