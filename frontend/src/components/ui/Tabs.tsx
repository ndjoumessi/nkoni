import { useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Segmented control accessible (motif APG « tabs ») — CONTRÔLÉ : le parent détient l'onglet actif
 * et rend le panneau correspondant. Navigation clavier : ←/→ (avec bouclage) + Home/Fin, et
 * `tabIndex` roving (seul l'onglet actif est tabbable). Anneau focus = `:focus-visible` global menthe.
 *
 * Le parent devrait envelopper le contenu de chaque onglet dans un `role="tabpanel"`.
 */
export interface TabOption {
  value: string
  label: string
}

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  options: TabOption[]
  /** Étiquette du groupe pour les lecteurs d'écran (obligatoire sur un `role="tablist"`). */
  ariaLabel: string
  className?: string
}

export function Tabs({ value, onValueChange, options, ariaLabel, className }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const aller = (i: number) => {
    const cible = options[i]
    if (!cible) return
    onValueChange(cible.value)
    refs.current[i]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const n = options.length
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        aller((i + 1) % n)
        break
      case 'ArrowLeft':
        e.preventDefault()
        aller((i - 1 + n) % n)
        break
      case 'Home':
        e.preventDefault()
        aller(0)
        break
      case 'End':
        e.preventDefault()
        aller(n - 1)
        break
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex gap-1 rounded-full border border-hairline bg-surface p-1', className)}
    >
      {options.map((o, i) => {
        const actif = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={actif}
            tabIndex={actif ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none',
              actif ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
