import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarRange, CheckCircle2, Flame, MapPin, Plus, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { commemorationsApi, messageErreur, type Commemoration } from '@/lib/api'
import { peutVoirCommemorations, peutGererCommemorations } from '@/lib/roles'
import { formatDateFR, staggerDelay } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import {
  StatutCommemorationBadge,
  TypeCommemorationBadge,
} from '@/components/commemorations/CommemorationBadges'

/** Liste des commémorations / cérémonies (V2) — triée par date décroissante. */
export function CommemorationsPage() {
  const { user, accessToken } = useAuth()

  const [items, setItems] = useState<Commemoration[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gestion = peutGererCommemorations(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await commemorationsApi.list(accessToken, controller.signal)
        if (active) setItems(data)
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

  if (!peutVoirCommemorations(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <>
      <PageHeader
        overline="Mémoire familiale"
        title="Commémorations & cérémonies"
        description={items ? `${items.length} événement${items.length > 1 ? 's' : ''}` : undefined}
        actions={
          // Masqué quand la liste est vide : l'EmptyState porte déjà le CTA (pas de doublon).
          gestion && (!items || items.length > 0) && (
            <ButtonLink to="/commemorations/nouvelle" icon={Plus}>
              Nouvelle
            </ButtonLink>
          )
        }
      />

      {items && items.length > 0 && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Événements" value={String(items.length)} icon={Flame} />
          <StatCard
            label="Planifiées"
            value={String(items.filter((c) => c.statut === 'PLANIFIEE').length)}
            tone="brass"
            icon={CalendarRange}
          />
          <StatCard
            label="Tenues"
            value={String(items.filter((c) => c.statut === 'TENUE').length)}
            tone="jade"
            icon={CheckCircle2}
          />
          <StatCard
            label="Cérémonies"
            value={String(items.filter((c) => c.type === 'CEREMONIE').length)}
            icon={Users}
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
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && items && items.length === 0 && (
          <EmptyState
            icon={Flame}
            title="Aucune commémoration"
            className="min-h-[45vh] justify-center"
            description={
              gestion
                ? 'Planifiez une commémoration ou une cérémonie pour la famille.'
                : 'Les commémorations et cérémonies apparaîtront ici.'
            }
            action={
              gestion && (
                <ButtonLink to="/commemorations/nouvelle" icon={Plus}>
                  Nouvelle
                </ButtonLink>
              )
            }
          />
        )}

        {!loading && !error && items && items.length > 0 && (
          <ul className="space-y-3">
            {items.map((c, i) => (
              <li key={c.id} className="nk-reveal" style={staggerDelay(i)}>
                <Link
                  to={`/commemorations/${c.id}`}
                  className="group block rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeCommemorationBadge type={c.type} size="sm" />
                        <StatutCommemorationBadge statut={c.statut} size="sm" />
                      </div>
                      <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                        <Flame className="h-4 w-4 text-brass" aria-hidden="true" />
                        {c.titre}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarRange className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                          {formatDateFR(c.date)}
                        </span>
                        {c.lieu && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                            {c.lieu}
                          </span>
                        )}
                        {c.membresConcernes.length > 0 && (
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                            {c.membresConcernes.length} honoré
                            {c.membresConcernes.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
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

export default CommemorationsPage
