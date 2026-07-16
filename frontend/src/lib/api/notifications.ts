import { request } from './core'

/* -------------------------------------------------------------------------- */
/* Notifications (§5) — préférences par type                                  */
/* -------------------------------------------------------------------------- */

export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD'
export type PreferencesNotification = Record<TypeNotification, boolean>

export const notificationsApi = {
  getPreferences: (accessToken: string, signal?: AbortSignal) =>
    request<PreferencesNotification>('/notifications/preferences', { accessToken, signal }),
  updatePreferences: (patch: Partial<PreferencesNotification>, accessToken: string) =>
    request<PreferencesNotification>('/notifications/preferences', {
      method: 'PATCH',
      json: patch,
      accessToken,
    }),
}
