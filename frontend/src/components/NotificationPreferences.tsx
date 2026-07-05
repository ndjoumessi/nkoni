import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  notificationsApi,
  messageErreur,
  ApiError,
  type PreferencesNotification,
  type TypeNotification,
} from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Card, Overline } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'

const TYPES: { cle: TypeNotification; titre: string; desc: string }[] = [
  {
    cle: 'VERSEMENT_RECU',
    titre: 'Versement enregistré',
    desc: 'Confirmation quand un de vos versements est enregistré.',
  },
  {
    cle: 'COTISATION_RETARD',
    titre: 'Cotisation en retard',
    desc: 'Rappel quand votre cotisation n’est pas à jour.',
  },
]

/**
 * Préférences de notification (§5) — un interrupteur par type. Mise à jour optimiste avec
 * rollback si l'appel échoue. Par défaut tout est activé (rétrocompatible côté serveur).
 */
export function NotificationPreferences() {
  const { accessToken } = useAuth()
  const toast = useToast()

  const [prefs, setPrefs] = useState<PreferencesNotification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<TypeNotification | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    void notificationsApi
      .getPreferences(accessToken, controller.signal)
      .then((p) => {
        if (actif) setPrefs(p)
      })
      .catch((e) => {
        if (actif && !(e instanceof DOMException && e.name === 'AbortError')) {
          setError(messageErreur(e))
        }
      })
    return () => {
      actif = false
      controller.abort()
    }
  }, [accessToken])

  const basculer = async (cle: TypeNotification, valeur: boolean) => {
    if (!accessToken || !prefs) return
    const precedent = prefs
    setSaving(cle)
    setPrefs({ ...prefs, [cle]: valeur }) // optimiste
    try {
      const maj = await notificationsApi.updatePreferences({ [cle]: valeur }, accessToken)
      setPrefs(maj)
    } catch (e) {
      setPrefs(precedent) // rollback
      toast.error(
        'Modification impossible',
        e instanceof ApiError ? e.message : 'Réessayez plus tard.',
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card className="nk-reveal nk-d3 mt-6 p-6">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>Préférences de notification</Overline>
      </div>
      <p className="mt-2 text-sm text-faint">
        Choisissez les notifications que vous souhaitez recevoir dans l’application.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-terra">{error}</p>
      ) : !prefs ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {TYPES.map(({ cle, titre, desc }) => (
            <li key={cle} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <span id={`pref-${cle}`} className="block text-sm font-medium text-foreground">
                  {titre}
                </span>
                <span className="mt-0.5 block text-xs text-faint">{desc}</span>
              </div>
              <Toggle
                checked={prefs[cle]}
                onChange={(v) => basculer(cle, v)}
                disabled={saving === cle}
                aria-labelledby={`pref-${cle}`}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default NotificationPreferences
