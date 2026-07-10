import { useEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { Building2, CalendarDays, Coins, Crown, Languages, Lock, Users, type LucideProps } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { organisationApi, messageErreur, type OrganisationCourante } from '@/lib/api'
import { peutVoirParametres } from '@/lib/roles'
import { cn, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

/** Ligne d'information en lecture seule (icône + libellé + valeur). */
function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<LucideProps>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

/** Couleur de la jauge de membres : jade tant qu'il reste de la marge, ambre proche du plafond, terra à la limite. */
function couleurJauge(pct: number): string {
  if (pct >= 100) return 'bg-terra'
  if (pct >= 80) return 'bg-amber'
  return 'bg-jade'
}

/**
 * Écran Paramètres (§5) — informations de l'organisation courante, en LECTURE SEULE.
 * Nom, devise et langue par défaut sont IMMUABLES (fixés à l'inscription) → aucun formulaire,
 * juste un rappel explicite du caractère définitif + le compteur de membres face au forfait.
 */
export function ParametresPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()

  const [org, setOrg] = useState<OrganisationCourante | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !peutVoirParametres(user?.role)) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    organisationApi
      .moi(accessToken, controller.signal)
      .then((d) => {
        if (active) setOrg(d)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, user?.role])

  // Garde d'accès (miroir de la matrice back Organisation:read) : MEMBRE_SIMPLE redirigé.
  if (!peutVoirParametres(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const deviseLabel = org ? t(`inscription.devises.${org.devise.toLowerCase()}`) : ''
  const langueLabel = org ? t(org.langueDefaut === 'EN' ? 'commun.langue.en' : 'commun.langue.fr') : ''
  const chefLabel = org?.chefMembreId
    ? `${org.chefNom ?? ''} ${org.chefPrenom ?? ''}`.trim() +
      (org.chefSurnom ? ` « ${org.chefSurnom} »` : '')
    : t('parametres.infos.chefNonDesigne')
  const pct = org ? Math.min(100, Math.round((org.nbMembres / org.limiteMembres) * 100)) : 0
  const restants = org ? Math.max(0, org.limiteMembres - org.nbMembres) : 0
  const limiteAtteinte = org ? org.nbMembres >= org.limiteMembres : false

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader overline={t('parametres.overline')} title={t('parametres.titre')} />
      <p className="mt-2 text-sm text-muted-foreground">{t('parametres.sousTitre')}</p>

      {loading ? (
        <div className="mt-7 space-y-6">
          <Skeleton className="h-56" />
          <Skeleton className="h-32" />
        </div>
      ) : error ? (
        <Card className="nk-reveal mt-7 p-6">
          <p className="text-sm text-terra">{error}</p>
        </Card>
      ) : org ? (
        <div className="mt-7 space-y-6">
          {/* Informations immuables */}
          <Card className="nk-reveal nk-d1 p-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brass" aria-hidden="true" />
              <Overline>{t('parametres.infos.titre')}</Overline>
            </div>
            <dl className="mt-3 divide-y divide-hairline">
              <Info icon={Building2} label={t('parametres.infos.nom')} value={org.nom} />
              <Info icon={Crown} label={t('parametres.infos.chef')} value={chefLabel} />
              <Info icon={Coins} label={t('parametres.infos.devise')} value={deviseLabel} />
              <Info icon={Languages} label={t('parametres.infos.langue')} value={langueLabel} />
              <Info
                icon={CalendarDays}
                label={t('parametres.infos.creation')}
                value={formatDate(org.createdAt)}
              />
            </dl>

            {/* Rappel du caractère définitif (§5) — pas d'édition possible. */}
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/40 p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">{t('parametres.immuable.titre')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('parametres.immuable.texte')}</p>
              </div>
            </div>
          </Card>

          {/* Volume de membres vs forfait */}
          <Card className="nk-reveal nk-d2 p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brass" aria-hidden="true" />
              <Overline>{t('parametres.membres.titre')}</Overline>
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {t('parametres.membres.compteur', { count: org.nbMembres, limite: org.limiteMembres })}
              </p>
              <span className="text-xs uppercase tracking-wide text-faint">
                {t('parametres.membres.forfait')}
              </span>
            </div>

            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={org.nbMembres}
              aria-valuemin={0}
              aria-valuemax={org.limiteMembres}
              aria-label={t('parametres.membres.titre')}
            >
              <div
                className={cn('h-full rounded-full transition-all', couleurJauge(pct))}
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className={cn('mt-2 text-xs', limiteAtteinte ? 'text-terra' : 'text-muted-foreground')}>
              {limiteAtteinte
                ? t('parametres.membres.limiteAtteinte')
                : t('parametres.membres.restants', { count: restants })}
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

export default ParametresPage
