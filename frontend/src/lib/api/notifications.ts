import { request, rid } from './core'

/* -------------------------------------------------------------------------- */
/* Notifications (§5) — préférences par type                                  */
/* -------------------------------------------------------------------------- */

export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD' | 'REUNION_RAPPEL'
export type PreferencesNotification = Record<TypeNotification, boolean>

/** Notification in-app du destinataire (§5). */
export interface Notification {
  id: string
  type: TypeNotification
  titre: string
  message: string
  lu: boolean
  dateCreation: string
}

export const notificationsApi = {
  /** Notifications du compte connecté (les plus récentes d'abord). */
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Notification[]>('/notifications', { accessToken, signal }),
  /** Marque toutes ses notifications non-lues comme lues → nombre marqué. */
  marquerToutesLues: (accessToken: string) =>
    request<{ count: number }>('/notifications/tout-lu', { method: 'PATCH', accessToken }),
  /** Marque UNE de ses notifications comme lue (204 ; 404 si pas la sienne). */
  marquerLue: (id: string, accessToken: string) =>
    request<void>(`/notifications/${rid(id)}/lu`, { method: 'PATCH', accessToken }),
  /** Supprime (écarte) UNE de ses notifications (204 ; 404 si pas la sienne). */
  supprimer: (id: string, accessToken: string) =>
    request<void>(`/notifications/${rid(id)}`, { method: 'DELETE', accessToken }),
  getPreferences: (accessToken: string, signal?: AbortSignal) =>
    request<PreferencesNotification>('/notifications/preferences', { accessToken, signal }),
  updatePreferences: (patch: Partial<PreferencesNotification>, accessToken: string) =>
    request<PreferencesNotification>('/notifications/preferences', {
      method: 'PATCH',
      json: patch,
      accessToken,
    }),
}

/* -------------------------------------------------------------------------- */
/* Web Push — (dés)abonnement par appareil + clé publique VAPID               */
/* -------------------------------------------------------------------------- */

/** Abonnement Web Push envoyé au serveur (forme restreinte de `PushSubscription.toJSON()`). */
export interface AbonnementPush {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export const pushApi = {
  /** Clé publique VAPID (null si le serveur n'a pas configuré le push). */
  clePublique: (accessToken: string, signal?: AbortSignal) =>
    request<{ clePublique: string | null }>('/notifications/push/cle-publique', {
      accessToken,
      signal,
    }),
  /** Enregistre l'abonnement de CET appareil. */
  subscribe: (abonnement: AbonnementPush, accessToken: string) =>
    request<{ ok: boolean }>('/notifications/push/subscribe', {
      method: 'POST',
      json: abonnement,
      accessToken,
    }),
  /** Désinscrit CET appareil (par endpoint). */
  unsubscribe: (endpoint: string, accessToken: string) =>
    request<void>('/notifications/push/subscribe', {
      method: 'DELETE',
      json: { endpoint },
      accessToken,
    }),
}
