import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * État vide traité comme du vrai contenu : icône halo, message d'orientation, CTA.
 * Utilisé pour le dashboard sans données, les listes vides, etc.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = 'brass',
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  tone?: 'brass' | 'jade'
}) {
  const ring =
    tone === 'jade'
      ? 'text-jade shadow-[0_0_0_1px_oklch(0.735_0.128_166/25%),0_18px_40px_-20px_oklch(0.735_0.128_166/40%)]'
      : 'text-brass shadow-[0_0_0_1px_oklch(0.805_0.116_84/25%),0_18px_40px_-20px_oklch(0.805_0.116_84/40%)]'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-hairline bg-surface/60 px-6 py-14 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2',
          ring,
        )}
      >
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  )
}

export default EmptyState
