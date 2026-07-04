import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Carte NKONI — 3 niveaux d'élévation réels (fini les cartes toutes identiques).
 * `feature` porte un liseré laiton pour la hiérarchie ; `interactive` réagit au survol.
 */
const cardVariants = cva('rounded-2xl border transition-all duration-150 ease-out', {
  variants: {
    variant: {
      base: 'border-hairline bg-surface',
      raised: 'border-hairline-strong bg-surface-2 shadow-[0_16px_40px_-24px_oklch(0_0_0/70%)]',
      feature:
        'border-brass/25 bg-surface-2 shadow-[0_20px_50px_-28px_oklch(0.805_0.116_84/30%)] ring-1 ring-inset ring-brass/5',
      ghost: 'border-hairline/60 bg-surface/40',
    },
    interactive: {
      true: 'hover:-translate-y-0.5 hover:border-brass/30 hover:bg-surface-3',
      false: '',
    },
  },
  defaultVariants: { variant: 'base', interactive: false },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />
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
