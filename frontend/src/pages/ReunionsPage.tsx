import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarRange, ListChecks, MapPin, Plus, Gavel } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { reunionsApi, messageErreur, type ReunionListItem } from '@/lib/api'
import { peutVoirReunions, peutGererReunions } from '@/lib/roles'
import { formatDateFR } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { StatutReunionBadge, TypeReunionBadge } from '@/components/reunions/StatutBadges'

/** Liste des réunions (§5) — triée par date décroissante. Lecture pour tous les rôles. */
export function ReunionsPage() {
  const { user, accessToken } = useAuth()

  const [reunions, setReunions] = useState<ReunionListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [accessToken])

  if (!peutVoirReunions(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <>
      <PageHeader
        overline="Vie associative"
        title="Réunions"
        description={
          reunions ? `${reunions.length} réunion${reunions.length > 1 ? 's' : ''}` : undefined
        }
        actions={
          gestion && (
            <ButtonLink to="/reunions/nouvelle" icon={Plus}>
              Nouvelle réunion
            </ButtonLink>
          )
        }
      />

      <div className="nk-reveal nk-d2 mt-7">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && reunions && reunions.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title="Aucune réunion"
            className="min-h-[45vh] justify-center"
            description={
              gestion
                ? 'Planifiez la première réunion et composez son ordre du jour.'
                : 'Les réunions planifiées apparaîtront ici.'
            }
            action={
              gestion && (
                <ButtonLink to="/reunions/nouvelle" icon={Plus}>
                  Nouvelle réunion
                </ButtonLink>
              )
            }
            tips={[
              { icon: ListChecks, label: 'Ordre du jour réordonnable' },
              { icon: Gavel, label: 'Résolutions archivées' },
            ]}
          />
        )}

        {!loading && !error && reunions && reunions.length > 0 && (
          <ul className="space-y-3">
            {reunions.map((r) => (
              <li key={r.id}>
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
                        {formatDateFR(r.date)}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                        {r.lieu}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-xs text-faint">
                      <span className="inline-flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {r._count.pointsOrdreDuJour} point{r._count.pointsOrdreDuJour > 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
                        {r._count.resolutions} résolution{r._count.resolutions > 1 ? 's' : ''}
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
