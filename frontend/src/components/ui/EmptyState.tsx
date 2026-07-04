import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateTip {
  icon?: LucideIcon
  label: string
}

/**
 * État vide traité comme du vrai contenu : texture de marque discrète (grain + tissage
 * laiton/jade), halo, icône, message d'orientation, CTA, et une rangée d'« astuces »
 * optionnelle pour donner du contexte plutôt que du vide.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tips,
  className,
  tone = 'brass',
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  tips?: EmptyStateTip[]
  className?: string
  tone?: 'brass' | 'jade'
}) {
  const ring =
    tone === 'jade'
      ? 'text-jade shadow-[0_0_0_1px_oklch(0.735_0.128_166/25%),0_18px_40px_-20px_oklch(0.735_0.128_166/45%)]'
      : 'text-brass shadow-[0_0_0_1px_oklch(0.805_0.116_84/25%),0_18px_40px_-20px_oklch(0.805_0.116_84/45%)]'
  const glow =
    tone === 'jade' ? 'oklch(0.735 0.128 166 / 18%)' : 'oklch(0.805 0.116 84 / 18%)'

  return (
    <div
      className={cn(
        'relative isolate flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-hairline bg-surface/50 px-6 py-16 text-center',
        className,
      )}
    >
      {/* Textures de marque discrètes */}
      <div className="nk-weave pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div
        className="nk-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.04] mix-blend-overlay"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[34%] -z-10 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: glow }}
        aria-hidden="true"
      />

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

      {tips && tips.length > 0 && (
        <div className="mt-9 flex max-w-md flex-wrap items-center justify-center gap-2 border-t border-hairline/70 pt-7">
          {tips.map((t) => {
            const TipIcon = t.icon
            return (
              <span
                key={t.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/60 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {TipIcon && <TipIcon className="h-3.5 w-3.5 text-brass" aria-hidden="true" />}
                {t.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default EmptyState
