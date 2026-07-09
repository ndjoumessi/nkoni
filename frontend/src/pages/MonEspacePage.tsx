import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet, ArrowDownCircle, CircleDollarSign, CalendarDays, FileText, Download, UserX } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  moiApi,
  ApiError,
  type SituationMembre,
  type ContributionMembre,
  type ReunionAVenir,
  type RecuMembre,
} from '@/lib/api'
import { formatMontant } from '@/lib/format'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import type { StatutContribution, StatutMembre } from '@/lib/api'

export function MonEspacePage() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()

  const [situation, setSituation] = useState<SituationMembre | null>(null)
  const [contributions, setContributions] = useState<ContributionMembre[]>([])
  const [reunions, setReunions] = useState<ReunionAVenir[]>([])
  const [recus, setRecus] = useState<RecuMembre[]>([])
  const [loading, setLoading] = useState(true)
  const [sansFiche, setSansFiche] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    void (async () => {
      try {
        const s = await moiApi.situation(accessToken, controller.signal)
        if (!actif) return
        setSituation(s)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (actif && e instanceof ApiError && e.status === 404) setSansFiche(true)
        if (actif) setLoading(false)
        return
      }
      // Listes (best-effort, chargées en parallèle).
      const [c, r, rc] = await Promise.all([
        moiApi.contributions(accessToken, controller.signal).catch(() => []),
        moiApi.reunions(accessToken, controller.signal).catch(() => []),
        moiApi.recus(accessToken, controller.signal).catch(() => []),
      ])
      if (!actif) return
      setContributions(c)
      setReunions(r)
      setRecus(rc)
      setLoading(false)
    })()
    return () => {
      actif = false
      controller.abort()
    }
  }, [accessToken])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-56 rounded-2xl" />
      </div>
    )
  }

  if (sansFiche || !situation) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={t('monEspace.titre')} description={t('monEspace.sousTitre')} />
        <Card className="mt-6 p-6">
          <EmptyState icon={UserX} title={t('monEspace.aucuneFiche.titre')} description={t('monEspace.aucuneFiche.texte')} />
        </Card>
      </div>
    )
  }

  const { membre, cotisation } = situation
  const reste = Math.max(0, cotisation.totalDu - cotisation.totalVerse)

  const colContributions: Column<ContributionMembre>[] = [
    { key: 'annee', header: t('monEspace.contributions.annee'), numeric: true, cell: (c) => c.annee },
    { key: 'attendu', header: t('monEspace.contributions.attendu'), numeric: true, cell: (c) => formatMontant(c.montantAttendu) },
    { key: 'verse', header: t('monEspace.contributions.verse'), numeric: true, cell: (c) => formatMontant(c.montantVerse) },
    {
      key: 'valorise',
      header: t('monEspace.contributions.valorise'),
      numeric: true,
      cell: (c) => <span className="text-jade">{formatMontant(c.montantValorise)}</span>,
    },
  ]

  const colRecus: Column<RecuMembre>[] = [
    { key: 'numero', header: t('monEspace.recus.numero'), cell: (r) => <span className="num">{r.numero}</span> },
    { key: 'date', header: t('monEspace.recus.date'), cell: (r) => formatDate(r.date) },
    { key: 'montant', header: t('monEspace.recus.montant'), numeric: true, cell: (r) => formatMontant(r.montant) },
    {
      key: 'telecharger',
      header: '',
      align: 'right',
      cell: (r) =>
        r.telechargeable ? (
          <Button type="button" variant="ghost" size="sm" icon={Download}>
            {t('monEspace.recus.telecharger')}
          </Button>
        ) : (
          <span className="text-xs text-faint">{t('monEspace.recus.indisponible')}</span>
        ),
    },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('monEspace.titre')}
        description={t('monEspace.sousTitre')}
      />

      {/* Ma situation */}
      <Card className="nk-reveal nk-d2 mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Overline>{t('monEspace.situation.titre')}</Overline>
          <div className="flex flex-wrap items-center gap-2">
            <StatutMembreBadge statut={membre.statut as StatutMembre} size="sm" />
            <StatutCotisationBadge statut={cotisation.statut as StatutContribution} size="sm" />
          </div>
        </div>
        <p className="mt-1 text-lg font-medium text-foreground">
          {membre.nom} <span className="text-muted-foreground">{membre.prenom}</span>
        </p>
        <p className="mt-0.5 text-sm text-faint">
          {t('monEspace.situation.branche')} : {membre.branche ?? '—'} ·{' '}
          {t('monEspace.situation.anneeAdhesion')} : <span className="num">{membre.anneeAdhesion}</span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('monEspace.situation.totalDu')} value={formatMontant(cotisation.totalDu)} icon={CircleDollarSign} />
          <StatCard label={t('monEspace.situation.totalVerse')} value={formatMontant(cotisation.totalVerse)} tone="jade" icon={ArrowDownCircle} />
          <StatCard label={t('monEspace.situation.reste')} value={formatMontant(reste)} tone={reste > 0 ? 'brass' : 'jade'} icon={Wallet} />
        </div>
      </Card>

      {/* Mes contributions */}
      <Card className="nk-reveal nk-d3 mt-4 p-6">
        <Overline>{t('monEspace.contributions.titre')}</Overline>
        {contributions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.contributions.aucune')}</p>
        ) : (
          <div className="mt-4">
            <DataTable columns={colContributions} rows={contributions} rowKey={(c) => c.id} />
          </div>
        )}
      </Card>

      {/* Réunions à venir */}
      <Card className="nk-reveal nk-d4 mt-4 p-6">
        <Overline>{t('monEspace.reunions.titre')}</Overline>
        {reunions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.reunions.aucune')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {reunions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/40 p-3.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{formatDate(r.date, { dateStyle: 'long' })}</p>
                  <p className="mt-0.5 text-xs text-faint">{t('monEspace.reunions.lieu')} : {r.lieu}</p>
                </div>
                <Badge tone="neutral" size="sm">{r.type}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Mes reçus */}
      <Card className="nk-reveal nk-d5 mt-4 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('monEspace.recus.titre')}</Overline>
        </div>
        {recus.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.recus.aucun')}</p>
        ) : (
          <div className="mt-4">
            <DataTable columns={colRecus} rows={recus} rowKey={(r) => r.id} />
          </div>
        )}
      </Card>
    </div>
  )
}

export default MonEspacePage
