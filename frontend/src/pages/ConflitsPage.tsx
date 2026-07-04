import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarRange, Plus, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { conflitsApi, messageErreur, type Conflit } from '@/lib/api'
import { peutVoirConflits, peutDeclarerConflit } from '@/lib/roles'
import { formatDateFR } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { NiveauBadge, StatutConflitBadge } from '@/components/conflits/ConflitBadges'

/** Liste des conflits VISIBLES par l'utilisateur (filtrage appliqué côté serveur). */
export function ConflitsPage() {
  const { user, accessToken } = useAuth()

  const [conflits, setConflits] = useState<Conflit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const declarer = peutDeclarerConflit(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await conflitsApi.list(accessToken, controller.signal)
        if (active) setConflits(data)
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

  if (!peutVoirConflits(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <>
      <PageHeader
        overline="Suivi familial"
        title="Conflits"
        description={
          conflits ? `${conflits.length} conflit${conflits.length > 1 ? 's' : ''} visible${conflits.length > 1 ? 's' : ''}` : undefined
        }
        actions={
          declarer && (
            <ButtonLink to="/conflits/nouveau" icon={Plus}>
              Déclarer un conflit
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

        {!loading && !error && conflits && conflits.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            tone="jade"
            title="Aucun conflit visible"
            className="min-h-[45vh] justify-center"
            description={
              declarer
                ? 'Aucun conflit dans votre périmètre pour le moment. Vous pouvez en déclarer un.'
                : 'Aucun conflit ne vous est accessible pour le moment.'
            }
            action={
              declarer && (
                <ButtonLink to="/conflits/nouveau" icon={Plus}>
                  Déclarer un conflit
                </ButtonLink>
              )
            }
          />
        )}

        {!loading && !error && conflits && conflits.length > 0 && (
          <ul className="space-y-3">
            {conflits.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/conflits/${c.id}`}
                  className="group block rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <NiveauBadge niveau={c.niveauConfidentialite} size="sm" />
                        <StatutConflitBadge statut={c.statut} size="sm" />
                      </div>
                      <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                        <ShieldAlert className="h-4 w-4 text-brass" aria-hidden="true" />
                        {c.titre}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarRange className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                          {formatDateFR(c.dateOuverture)}
                        </span>
                        {c.membresConcernes.length > 0 && (
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                            {c.membresConcernes.length} concerné
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

export default ConflitsPage
