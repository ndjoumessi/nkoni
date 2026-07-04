import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './Card'

/**
 * Carte statistique secondaire (label + valeur tabular + icône).
 * La métrique dominante du dashboard utilise plutôt MetricHero.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className,
}: {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  tone?: 'neutral' | 'brass' | 'jade'
  className?: string
}) {
  const iconTone =
    tone === 'brass' ? 'text-brass' : tone === 'jade' ? 'text-jade' : 'text-muted-foreground'
  return (
    <Card interactive className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2', iconTone)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="num mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Card>
  )
}

export default StatCard
