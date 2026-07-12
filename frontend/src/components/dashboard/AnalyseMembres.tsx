import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, GitBranch, MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { membresApi, type MembreStatut } from '@/lib/api'
import { formatMontant, formatPourcent } from '@/lib/format'
import { Card, Overline } from '@/components/ui/Card'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn, lienRelanceWhatsApp } from '@/lib/utils'

/**
 * Analyses complémentaires du dashboard, 100% côté client à partir de GET /membres/statuts
 * (attendu/valorisé déjà présents par membre) — aucun endpoint supplémentaire.
 *  · Recouvrement par branche (classement, branches en retard en tête)
 *  · Membres à relancer (actifs non à jour / partiels)
 */

interface BrancheStat {
  id: string
  nom: string
  attendu: number
  valorise: number
  taux: number
}

const RELANCE_TONE: Record<'PARTIEL' | 'NON_A_JOUR', BadgeProps['tone']> = {
  PARTIEL: 'amber',
  NON_A_JOUR: 'terra',
}

function barColor(taux: number): string {
  if (taux >= 80) return 'bg-jade'
  if (taux >= 50) return 'bg-amber'
  return 'bg-terra'
}

export function AnalyseMembres() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const [membres, setMembres] = useState<MembreStatut[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const data = await membresApi.listStatuts(accessToken, controller.signal)
        if (active) setMembres(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setFailed(true)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken])

  const branches = useMemo<BrancheStat[]>(() => {
    if (!membres) return []
    const map = new Map<string, BrancheStat>()
    for (const m of membres) {
      const id = m.branche?.id ?? '—'
      const nom = m.branche?.nom ?? t('branches.sansBranche')
      const cur = map.get(id) ?? { id, nom, attendu: 0, valorise: 0, taux: 0 }
      cur.attendu += m.totalAttenduCumule
      cur.valorise += m.totalValoriseCumule
      map.set(id, cur)
    }
    return [...map.values()]
      .filter((b) => b.attendu > 0)
      .map((b) => ({ ...b, taux: Math.min(100, (b.valorise / b.attendu) * 100) }))
      .sort((a, b) => a.taux - b.taux)
  }, [membres, t])

  const relance = useMemo(() => {
    if (!membres) return []
    return membres
      .filter((m) => m.statut === 'ACTIF' && m.statutCotisation !== 'A_JOUR')
      .map((m) => ({ ...m, manque: Math.max(0, m.totalAttenduCumule - m.totalValoriseCumule) }))
      .sort((a, b) => {
        if (a.statutCotisation !== b.statutCotisation)
          return a.statutCotisation === 'NON_A_JOUR' ? -1 : 1
        return b.manque - a.manque
      })
  }, [membres])

  // Best-effort : en cas d'échec (droit d'accès), on n'affiche rien.
  if (failed) return null

  if (!membres) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-24" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-24" />
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Recouvrement par branche */}
      {branches.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('dashboard.analyse.recouvrementBranche')}</Overline>
          </div>
          <ul className="mt-4 space-y-3.5">
            {branches.map((b) => (
              <li key={b.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    to={`/membres?branche=${encodeURIComponent(b.id)}`}
                    className="truncate font-medium text-foreground transition-colors hover:text-brass"
                  >
                    {b.nom}
                  </Link>
                  <span className="num shrink-0 font-semibold text-foreground">
                    {formatPourcent(Math.round(b.taux))}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn('h-full rounded-full transition-all', barColor(b.taux))}
                    style={{ width: `${b.taux}%` }}
                  />
                </div>
                <p className="num mt-1 text-xs text-faint">
                  {formatMontant(b.valorise)} / {formatMontant(b.attendu)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Membres à relancer */}
      <Card className={cn('p-5', branches.length === 0 && 'lg:col-span-2')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-terra" aria-hidden="true" />
            <Overline>{t('dashboard.analyse.aRelancer')}</Overline>
          </div>
          {relance.length > 0 && (
            <Badge tone="terra" size="sm">
              {relance.length}
            </Badge>
          )}
        </div>

        {relance.length === 0 ? (
          <p className="mt-4 text-sm text-jade">{t('dashboard.analyse.tousAJour')}</p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-hairline">
              {relance.slice(0, 6).map((m) => {
                const lienWa = lienRelanceWhatsApp(
                  m.telephone,
                  t('dashboard.analyse.relanceMessage', { prenom: m.prenom, montant: formatMontant(m.manque) }),
                )
                return (
                  <li key={m.id} className="flex items-center gap-2">
                    <Link
                      to={`/membres/${m.id}`}
                      className="group flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-sm transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground group-hover:text-brass">
                          {m.nom} {m.prenom}
                        </span>
                        <span className="num block truncate text-xs text-faint">
                          {t('dashboard.analyse.reste', { montant: formatMontant(m.manque) })}
                          {m.branche ? ` · ${m.branche.nom}` : ''}
                        </span>
                      </span>
                      <Badge tone={RELANCE_TONE[m.statutCotisation as 'PARTIEL' | 'NON_A_JOUR']} size="sm">
                        {t(`dashboard.statut.${m.statutCotisation as 'PARTIEL' | 'NON_A_JOUR'}`)}
                      </Badge>
                    </Link>
                    {lienWa && (
                      <a
                        href={lienWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg p-2 text-jade transition-colors hover:bg-jade/10"
                        aria-label={t('dashboard.analyse.relancerWhatsApp')}
                        title={t('dashboard.analyse.relancerWhatsApp')}
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
            {relance.length > 6 && (
              <Link
                to="/membres?cotisation=NON_A_JOUR"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brass transition-colors hover:text-amber"
              >
                {t('dashboard.analyse.voirTous')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default AnalyseMembres
