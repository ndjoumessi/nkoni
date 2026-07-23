import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LogOut, History, Building2, Megaphone } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { statutApi, messageErreur, type GraviteIncident } from '@/lib/api'
import { cleI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'

const GRAVITES: GraviteIncident[] = ['INFO', 'MAINTENANCE', 'INCIDENT']

/**
 * Éditeur de la bannière d'incident (SUPER_ADMIN, §2.2/§8) — publie sur `/statut` un message
 * d'incident ou de maintenance que la sonde automatique ne peut pas exprimer. Ligne unique
 * (upsert). Charge l'état complet courant (message visible même inactif) pour pré-remplir.
 */
export function PlatformIncidentPage() {
  const { t } = useTranslation()
  const { user, accessToken, logout } = useAuth()
  const toast = useToast()

  const [chargement, setChargement] = useState(true)
  const [actif, setActif] = useState(false)
  const [gravite, setGravite] = useState<GraviteIncident>('INFO')
  const [message, setMessage] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let vivant = true
    setChargement(true)
    void statutApi
      .incidentAdmin(accessToken, controller.signal)
      .then((i) => {
        if (!vivant) return
        setActif(i.actif)
        setGravite(i.gravite)
        setMessage(i.message)
      })
      .catch(() => {
        /* pas de bannière encore configurée → on garde les valeurs par défaut */
      })
      .finally(() => {
        if (vivant) setChargement(false)
      })
    return () => {
      vivant = false
      controller.abort()
    }
  }, [accessToken])

  const enregistrer = async () => {
    if (!accessToken) return
    if (!message.trim()) {
      toast.error(t('superAdmin.incident.messageRequis'))
      return
    }
    setEnregistrement(true)
    try {
      await statutApi.definirIncident({ actif, gravite, message: message.trim() }, accessToken)
      toast.success(t('superAdmin.incident.enregistre'))
    } catch (e) {
      toast.error(t('superAdmin.incident.echec'), messageErreur(e))
    } finally {
      setEnregistrement(false)
    }
  }

  const lienNav = (to: string, actifNav: boolean, libelle: string, Icone: typeof History) => (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        actifNav ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {libelle}
    </Link>
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <NkoniMark className="h-8 w-8 text-lg" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">NKONI</span>
            <Badge tone="brass" size="sm">
              {t('superAdmin.header.plateforme')}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => void logout()}>
              {t('superAdmin.header.deconnexion')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <nav className="mb-6 inline-flex rounded-xl border border-hairline bg-surface/60 p-1">
          {lienNav('/super-admin', false, t('superAdmin.header.organisations'), Building2)}
          {lienNav('/super-admin/historique', false, t('superAdmin.header.historique'), History)}
          {lienNav('/super-admin/incident', true, t('superAdmin.header.incident'), Megaphone)}
        </nav>

        <PageHeader
          overline={t('superAdmin.incident.overline')}
          title={t('superAdmin.incident.titre')}
          description={t('superAdmin.incident.sousTitre')}
        />

        {chargement ? (
          <Skeleton className="mt-6 h-64 max-w-2xl rounded-2xl" />
        ) : (
          <Card className="mt-6 max-w-2xl space-y-5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('superAdmin.incident.actifLabel')}</p>
                <p className="mt-0.5 text-xs text-faint">{t('superAdmin.incident.actifHint')}</p>
              </div>
              <Toggle checked={actif} onChange={setActif} aria-label={t('superAdmin.incident.actifLabel')} />
            </div>

            <Field label={t('superAdmin.incident.graviteLabel')}>
              <Select value={gravite} onChange={(e) => setGravite(e.target.value as GraviteIncident)}>
                {GRAVITES.map((g) => (
                  <option key={g} value={g}>
                    {t(cleI18n(`statut.incident.gravites.${g}`))}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('superAdmin.incident.messageLabel')}>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t('superAdmin.incident.messagePlaceholder')}
              />
            </Field>
            <p className="-mt-3 text-xs text-faint">{t('superAdmin.incident.messageHint')}</p>

            <div className="flex justify-end">
              <Button type="button" loading={enregistrement} onClick={enregistrer}>
                {t('superAdmin.incident.enregistrer')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  )
}

export default PlatformIncidentPage
