import { AlertTriangle, RotateCcw, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from './Button'

/**
 * État d'erreur traité comme du vrai contenu — MIROIR d'`EmptyState` en tons terra :
 * pastille d'icône, titre, description (le message d'erreur), et bouton « Réessayer »
 * optionnel. `role="alert"` pour que les lecteurs d'écran annoncent l'échec (§1).
 *
 * Teinte pilotée par le TOKEN `--terra` (jamais d'oklch en dur) : `color-mix` applique l'alpha.
 */
export function ErrorState({
  icon: Icon = AlertTriangle,
  title,
  description,
  onRetry,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const accent = 'var(--terra)'
  const ringShadow = `0 0 0 1px color-mix(in oklch, ${accent} 25%, transparent), 0 18px 40px -20px color-mix(in oklch, ${accent} 40%, transparent)`
  const glow = `color-mix(in oklch, ${accent} 14%, transparent)`

  return (
    <div
      role="alert"
      className={cn(
        'relative isolate flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-terra/25 bg-surface/50 px-6 py-14 text-center',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-[34%] -z-10 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: glow }}
        aria-hidden="true"
      />

      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-terra"
        style={{ boxShadow: ringShadow }}
      >
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {onRetry && (
        <div className="mt-6">
          <Button variant="outline" icon={RotateCcw} onClick={onRetry}>
            {t('commun.actions.reessayer')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default ErrorState
