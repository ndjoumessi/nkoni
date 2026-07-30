import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './Card'

/**
 * Carte statistique secondaire (label + valeur tabular + icône).
 * La métrique dominante du dashboard utilise plutôt MetricHero.
 *
 * `to` : rend la carte cliquable (drill-down vers une liste filtrée) en l'enveloppant d'un `Link`
 * — le survol interactif de `Card` devient alors une vraie affordance. Sans `to`, carte inerte.
 */
const ICON_TONE = {
  neutral: 'text-muted-foreground',
  brass: 'text-brass',
  jade: 'text-jade',
  terra: 'text-terra',
  amber: 'text-amber',
} as const

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  to,
  onClick,
  className,
}: {
  label: string
  /** Chaîne (nombre/%, ex. `formatNombre`) OU `<Montant>` pour un montant à unité discrète. */
  value: ReactNode
  hint?: string
  icon?: LucideIcon
  tone?: keyof typeof ICON_TONE
  /** Destination de drill-down NAVIGUÉE (ex. `/membres?cotisation=NON_A_JOUR`). Rend la carte cliquable. */
  to?: string
  /** Action SUR PLACE (ex. poser un filtre de la page courante) — quand la navigation ne convient pas. */
  onClick?: () => void
  className?: string
}) {
  const carte = (
    <Card interactive className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2', ICON_TONE[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="num mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Card>
  )
  if (to) {
    return (
      <Link to={to} className="block rounded-2xl">
        {carte}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full rounded-2xl text-left">
        {carte}
      </button>
    )
  }
  return carte
}

export default StatCard
