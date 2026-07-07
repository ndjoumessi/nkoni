import { cva } from 'class-variance-authority'

/**
 * Variantes de style du bouton NKONI (partagées). Extraites du composant `Button` pour
 * pouvoir styliser d'autres éléments (ex. `<a href="mailto:…">`) avec la même apparence,
 * sans casser le fast-refresh (un fichier de composant ne doit exporter que des composants).
 *
 * `brass` = action primaire (rare) — dégradé DIAGONAL émeraude profond → or (`--emerald-deep`
 * → `--amber`) pour un rendu premium ; `outline`/`ghost` = secondaire, `danger` = destructif.
 */
export const buttonVariants = cva(
  'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-150 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        brass:
          'bg-gradient-to-br from-emerald-deep to-amber text-brass-foreground shadow-[0_1px_0_oklch(1_0_0/25%)_inset,0_10px_24px_-10px_oklch(0.60_0.15_163/55%)] hover:brightness-[1.08] active:brightness-95',
        outline:
          'border border-hairline-strong bg-surface-2/60 text-foreground hover:border-brass/40 hover:bg-surface-3',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        danger: 'border border-terra/30 bg-terra/10 text-terra hover:bg-terra/15',
        jade: 'border border-jade/30 bg-jade/10 text-jade hover:bg-jade/15',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-12 px-7 text-[0.95rem]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'brass', size: 'md' },
  },
)
