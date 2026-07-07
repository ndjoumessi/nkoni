import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Carte NKONI — hiérarchie par la BORDURE (thème « Menthe & Encre » : bordure fine plutôt que
 * glow, plus sobre). `raised` = surface plus élevée + bordure marquée ; `feature` = liseré menthe
 * (accent) sans halo ; `interactive` réagit au survol.
 */
const cardVariants = cva('rounded-2xl border transition-all duration-150 ease-out', {
  variants: {
    variant: {
      base: 'border-hairline bg-surface',
      raised: 'border-hairline-strong bg-surface-2',
      feature: 'border-brass/45 bg-surface-2 ring-1 ring-inset ring-brass/10',
      ghost: 'border-hairline/60 bg-surface/40',
    },
    // Densité UNIFORME des cartes : `default` (p-6) partout, `compact` (p-5) pour les cartes
    // denses, `none` quand le contenu gère lui-même son padding (tables, listes). Via twMerge,
    // un `p-*` explicite en className continue de primer (migration progressive des lots 2/3).
    padding: {
      default: 'p-6',
      compact: 'p-5',
      none: '',
    },
    interactive: {
      // `motion-safe:` : l'élévation au survol est supprimée si l'utilisateur réduit les animations.
      true: 'motion-safe:hover:-translate-y-0.5 hover:border-brass/40 hover:bg-surface-3',
      false: '',
    },
  },
  defaultVariants: { variant: 'base', padding: 'default', interactive: false },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, padding, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding, interactive }), className)} {...props} />
}

/** Petit sur-titre en capitales espacées — le « label » récurrent de l'app. */
export function Overline({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        'text-[0.7rem] font-medium uppercase tracking-[0.14em] text-faint',
        className,
      )}
      {...props}
    />
  )
}

export default Card
