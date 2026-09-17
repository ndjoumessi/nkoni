// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationPreferences } from './NotificationPreferences'

/**
 * Web Push par appareil en DÉMO (revue finale PR 3, I4) : l'abonnement navigateur était créé AVANT
 * le refus local de `pushApi.subscribe` → abonnement orphelin, et l'administrateur réel voyait
 * ensuite « actif » sans abonnement serveur. En démo, ni `Notification` ni `pushManager` ne sont touchés.
 */

const api = vi.hoisted(() => ({
  clePublique: vi.fn(async () => ({ clePublique: 'BAAA' })),
  subscribe: vi.fn(async () => undefined),
}))
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  messageErreur: () => 'erreur',
  notificationsApi: {
    getPreferences: async () => ({ VERSEMENT_RECU: true, COTISATION_RETARD: true, REUNION_RAPPEL: true }),
  },
  pushApi: { clePublique: api.clePublique, subscribe: api.subscribe, unsubscribe: vi.fn() },
}))
let modeDemo = false
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton', modeDemo }) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
const traduction = vi.hoisted(() => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => traduction,
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const requestPermission = vi.fn(async () => 'granted')
const getSubscription = vi.fn(async () => null)
const subscribe = vi.fn(async () => ({ endpoint: 'https://push.test/x', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }) }))

beforeEach(() => {
  modeDemo = false
  for (const f of [requestPermission, getSubscription, subscribe, api.subscribe]) f.mockClear()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { requestPermission } })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
  Reflect.deleteProperty(window, 'Notification')
})

const interrupteurPush = () => screen.findByRole('switch', { name: 'profil.notifications.push.titre' })

describe('NotificationPreferences — Web Push', () => {
  it('hors démo : activer demande la permission et abonne l’appareil (contrôle du test)', async () => {
    render(<NotificationPreferences />)
    fireEvent.click(await interrupteurPush())
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledTimes(1))
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('en démo : interrupteur désactivé et expliqué, ni Notification ni pushManager touchés', async () => {
    modeDemo = true
    render(<NotificationPreferences />)
    const interrupteur = (await interrupteurPush()) as HTMLButtonElement
    expect(interrupteur.disabled).toBe(true)
    expect(screen.getByText('demo.pushDesactive')).toBeTruthy()
    fireEvent.click(interrupteur)
    await new Promise((r) => setTimeout(r, 20))
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(getSubscription).not.toHaveBeenCalled()
    expect(api.subscribe).not.toHaveBeenCalled()
  })
})
