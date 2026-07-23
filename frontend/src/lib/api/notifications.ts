import { request } from './core'

/* -------------------------------------------------------------------------- */
/* Notifications (§5) — préférences par type                                  */
/* -------------------------------------------------------------------------- */

export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD'
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
  getPreferences: (accessToken: string, signal?: AbortSignal) =>
    request<PreferencesNotification>('/notifications/preferences', { accessToken, signal }),
  updatePreferences: (patch: Partial<PreferencesNotification>, accessToken: string) =>
    request<PreferencesNotification>('/notifications/preferences', {
      method: 'PATCH',
      json: patch,
      accessToken,
    }),
}
