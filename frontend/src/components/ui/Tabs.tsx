import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { panelId, tabId } from './tabs-ids'

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
  /**
   * Namespace d'id reliant chaque onglet à son panneau. Fourni ⇒ pairing APG : chaque onglet porte
   * un `id` (référencé par le panneau via `aria-labelledby`) et l'onglet ACTIF porte `aria-controls`
   * vers le panneau visible ; le parent pose les id symétriques via `panelId`/`tabId`.
   * Omis ⇒ pas de pairing (simple segmented control), aucun `aria-controls` pendouillant.
   */
  idBase?: string
  className?: string
}

export function Tabs({ value, onValueChange, options, ariaLabel, idBase, className }: TabsProps) {
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
            id={idBase ? tabId(idBase, o.value) : undefined}
            aria-selected={actif}
            // `aria-controls` UNIQUEMENT sur l'onglet actif : le motif « panneau unique réutilisé »
            // ne monte qu'UN panneau à la fois, donc un aria-controls sur un onglet inactif pointerait
            // vers un id absent du DOM (finding d'audit a11y automatisé). Seul l'actif contrôle un
            // panneau réel ; le panneau, lui, référence l'onglet actif via aria-labelledby.
            aria-controls={idBase && actif ? panelId(idBase, o.value) : undefined}
            tabIndex={actif ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              // `min-h-11` en mobile (44 px au doigt), resserré à partir de `sm:` pour garder la
              // densité au curseur — ces onglets faisaient 36 px et pilotent la navigation
              // secondaire de TOUTE l'app (Mon espace, Rapports, Trésorerie…).
              'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none sm:min-h-9',
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
