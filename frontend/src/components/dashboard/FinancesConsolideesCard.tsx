import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight, Coins, HeartHandshake, Landmark, Scale, type LucideIcon } from 'lucide-react'
import type { FinancesConsolidees } from '@/lib/api'
import { formatMontant } from '@/lib/format'
import { Card, Overline } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

/** Mini-métrique (icône + libellé + montant + sous-texte), optionnellement cliquable. */
function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text-foreground',
  to,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone?: string
  to?: string
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-faint">
        <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
        {label}
        {to && (
          <ChevronRight className="h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass" aria-hidden="true" />
        )}
      </span>
      <span className={cn('num mt-1.5 block text-lg font-semibold', tone)}>{value}</span>
      {sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}
    </>
  )
  const base = 'block rounded-xl border border-hairline bg-surface/60 px-4 py-3.5'
  return to ? (
    <Link to={to} className={cn(base, 'group transition-colors hover:border-hairline-strong hover:bg-surface-2/60')}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  )
}

/** Vue financière CONSOLIDÉE du dashboard : au-delà des cotisations (caisse, cagnottes, amendes). */
export function FinancesConsolideesCard({ data }: { data: FinancesConsolidees }) {
  const { t } = useTranslation()
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('dashboard.consolide.titre')}</Overline>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          icon={Landmark}
          label={t('dashboard.consolide.soldeCaisse')}
          value={formatMontant(data.soldeTresorerie)}
          tone={data.soldeTresorerie >= 0 ? 'text-jade' : 'text-terra'}
          to="/tresorerie"
        />
        <Metric
          icon={HeartHandshake}
          label={t('dashboard.consolide.cagnottes')}
          value={formatMontant(data.cagnottes.totalCollecte)}
          sub={t('dashboard.consolide.cagnottesOuvertes', { count: data.cagnottes.nombreOuvertes })}
          to="/cagnottes"
        />
        <Metric
          icon={Scale}
          label={t('dashboard.consolide.amendes')}
          value={formatMontant(data.amendes.du)}
          sub={t('dashboard.consolide.amendesEncaisse', { montant: formatMontant(data.amendes.encaisse) })}
          tone={data.amendes.du > 0 ? 'text-brass' : 'text-foreground'}
          to="/amendes"
        />
      </div>
    </Card>
  )
}

export default FinancesConsolideesCard
