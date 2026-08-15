import webpush from 'web-push'

/**
 * Web Push (notifications sur le téléphone) — envoi + persistance des abonnements.
 *
 * Client MOCKABLE (`PushClient`) exactement comme `WhatsAppClient`/`EmailClient` : la config réelle
 * (clés VAPID) n'est lue que par `vraiPushClient` ; en test on injecte un mock (aucun réseau). Sans
 * les 3 variables `VAPID_*`, le client réel est un NO-OP (`disponible=false`) — l'envoi est ignoré.
 * BEST-EFFORT : `envoyer` ne lève JAMAIS (le pipeline de notifications ne doit pas casser sur un
 * push raté). Un abonnement expiré/révoqué (404/410) est signalé via `expire:true` pour que
 * l'appelant purge la ligne morte.
 */

/** Un abonnement Web Push tel que stocké/consommé (forme standard `PushSubscription` du navigateur). */
export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushPayload {
  titre: string
  message: string
  /** Chemin à ouvrir au clic sur la notification (défaut `/`). */
  url?: string
}

export interface PushClient {
  /** Les 3 clés VAPID sont-elles présentes ? */
  disponible(): boolean
  /** Envoie une notification. Renvoie `{ ok }` ; `expire:true` si l'abonnement est mort (à purger). NE LÈVE PAS. */
  envoyer(sub: PushSubscriptionData, payload: PushPayload): Promise<{ ok: boolean; expire?: boolean }>
}

/** Client réel Web Push (lib `web-push`). No-op sans clés VAPID. */
export const vraiPushClient: PushClient = {
  disponible() {
    return Boolean(
      process.env['VAPID_PUBLIC_KEY'] &&
        process.env['VAPID_PRIVATE_KEY'] &&
        process.env['VAPID_SUBJECT'],
    )
  },
  async envoyer(sub, payload) {
    const sujet = process.env['VAPID_SUBJECT']
    const pub = process.env['VAPID_PUBLIC_KEY']
    const priv = process.env['VAPID_PRIVATE_KEY']
    if (!sujet || !pub || !priv) return { ok: false }
    try {
      webpush.setVapidDetails(sujet, pub, priv)
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ titre: payload.titre, message: payload.message, url: payload.url ?? '/' }),
      )
      return { ok: true }
    } catch (e) {
      // 404/410 = abonnement expiré ou révoqué côté navigateur → à supprimer de la base.
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) return { ok: false, expire: true }
      return { ok: false } // best-effort : toute autre erreur est avalée.
    }
  },
}

/* -------------------------------------------------------------------------- */
/* Persistance des abonnements (modèle scopé PushSubscription)                */
/* -------------------------------------------------------------------------- */

export interface PushPrisma {
  pushSubscription: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany(args: any): Promise<{ count: number }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ endpoint: string; p256dh: string; auth: string }[]>
  }
}

/**
 * Enregistre (ou remplace) l'abonnement d'un appareil. IDEMPOTENT : le navigateur renvoie le MÊME
 * `endpoint` à chaque `subscribe`, donc on supprime l'éventuelle ligne existante avant de recréer
 * (mêmes clés rafraîchies, bon `destinataireId`). Le `deleteMany`/`create` sont SCOPÉS par
 * l'extension tenant (contexte org posé par `authenticate`) → `organisationId` injecté.
 */
export async function enregistrerAbonnementPush(
  prisma: PushPrisma,
  destinataireId: string,
  sub: PushSubscriptionData,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } })
  await prisma.pushSubscription.create({
    data: {
      destinataireId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  })
}

/** Retire un abonnement par son `endpoint` (désinscription de l'appareil). Scopé par l'extension. */
export async function supprimerAbonnementPush(prisma: PushPrisma, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
}

/** Abonnements push d'un utilisateur (pour l'envoi best-effort par le pipeline de notifs). */
export async function abonnementsDe(
  prisma: PushPrisma,
  destinataireId: string,
): Promise<PushSubscriptionData[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { destinataireId },
    select: { endpoint: true, p256dh: true, auth: true },
  })
  return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }))
}

/** Une notification à pousser (collectée pendant la tx du scheduler, envoyée APRÈS le commit). */
export interface PushEnAttente {
  destinataireId: string
  titre: string
  message: string
}

/**
 * Pousse une notification à TOUS les appareils d'un destinataire. BEST-EFFORT : NE LÈVE JAMAIS
 * (un push raté ne doit casser ni la création de notification ni le scheduler). Purge les
 * abonnements morts (404/410 → `expire`).
 *
 * ⚠️ `prisma` doit être NON transactionnel (l'envoi vit HORS de toute tx — HTTP dans une tx =
 * anti-pattern) et le contexte d'ORGANISATION doit être posé par l'appelant (PushSubscription est
 * scopé) : côté route via `authenticate`, côté scheduler via un `orgContext.run` APRÈS le commit.
 */
export async function notifierParPush(
  prisma: PushPrisma,
  push: PushClient,
  destinataireId: string,
  payload: PushPayload,
): Promise<void> {
  if (!push.disponible()) return
  try {
    const abos = await abonnementsDe(prisma, destinataireId)
    for (const abo of abos) {
      const r = await push.envoyer(abo, payload)
      if (r.expire) await supprimerAbonnementPush(prisma, abo.endpoint)
    }
  } catch {
    // best-effort : toute erreur (lecture, envoi, purge) est avalée.
  }
}
