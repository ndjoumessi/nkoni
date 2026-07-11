import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { CalendarRange, CheckCircle2, ListChecks, MapPin, Plus, Gavel } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { reunionsApi, messageErreur, type ReunionListItem } from '@/lib/api'
import { peutVoirReunions, peutGererReunions } from '@/lib/roles'
import { formatDate, staggerDelay } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { StatutReunionBadge, TypeReunionBadge } from '@/components/reunions/StatutBadges'

/** Liste des réunions (§5) — triée par date décroissante. Lecture pour tous les rôles. */
export function ReunionsPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()

  const [reunions, setReunions] = useState<ReunionListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Incrémenté par le bouton « Réessayer » de l'ErrorState : relance l'effet de chargement.
  const [reloadKey, setReloadKey] = useState(0)

  const gestion = peutGererReunions(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await reunionsApi.list(accessToken, controller.signal)
        if (active) setReunions(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, reloadKey])

  if (!peutVoirReunions(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <>
      <PageHeader
        overline={t('reunions.overline')}
        title={t('reunions.liste.titre')}
        description={
          reunions ? t('reunions.liste.compteur', { count: reunions.length }) : undefined
        }
        actions={
          // Masqué quand la liste est vide : l'EmptyState porte déjà le CTA (pas de doublon).
          gestion && (!reunions || reunions.length > 0) && (
            <ButtonLink to="/reunions/nouvelle" icon={Plus}>
              {t('reunions.actions.nouvelle')}
            </ButtonLink>
          )
        }
      />

      {reunions && reunions.length > 0 && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-3 gap-3">
          <StatCard label={t('reunions.stats.total')} value={String(reunions.length)} icon={CalendarRange} />
          <StatCard
            label={t('reunions.stats.planifiees')}
            value={String(reunions.filter((r) => r.statut === 'PLANIFIEE').length)}
            tone="brass"
            icon={CalendarRange}
          />
          <StatCard
            label={t('reunions.stats.tenues')}
            value={String(reunions.filter((r) => r.statut === 'TENUE').length)}
            tone="jade"
            icon={CheckCircle2}
          />
        </div>
      )}

      <div className="nk-reveal nk-d3 mt-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <ErrorState
            title={t('commun.erreurs.chargementImpossible')}
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {!loading && !error && reunions && reunions.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title={t('reunions.vide.titre')}
            className="min-h-[45vh] justify-center"
            description={
              gestion
                ? t('reunions.vide.descriptionGestion')
                : t('reunions.vide.description')
            }
            action={
              gestion && (
                <ButtonLink to="/reunions/nouvelle" icon={Plus}>
                  {t('reunions.actions.nouvelle')}
                </ButtonLink>
              )
            }
            tips={[
              { icon: ListChecks, label: t('reunions.vide.tips.ordreDuJour') },
              { icon: Gavel, label: t('reunions.vide.tips.resolutions') },
            ]}
          />
        )}

        {!loading && !error && reunions && reunions.length > 0 && (
          <ul className="space-y-3">
            {reunions.map((r, i) => (
              <li key={r.id} className="nk-reveal" style={staggerDelay(i)}>
                <Link
                  to={`/reunions/${r.id}`}
                  className="group block rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatutReunionBadge statut={r.statut} size="sm" />
                        <TypeReunionBadge type={r.type} size="sm" />
                      </div>
                      <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                        <CalendarRange className="h-4 w-4 text-brass" aria-hidden="true" />
                        {formatDate(r.date)}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                        {r.lieu}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-xs text-faint">
                      <span className="inline-flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('reunions.carte.points', { count: r._count.pointsOrdreDuJour })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('resolutions.compteur', { count: r._count.resolutions })}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default ReunionsPage
