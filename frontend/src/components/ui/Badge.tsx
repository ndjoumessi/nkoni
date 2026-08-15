import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Pastille de statut / étiquette. Tons alignés sur la palette Laiton & Jade. */
const badgeVariants = cva(
  // `whitespace-nowrap` : un badge de statut reste TOUJOURS sur une ligne. Sans lui, dans une
  // colonne étroite (ex. « Statut » du tableau des contributions en mobile) le texte s'enroule et,
  // le badge étant `rounded-full`, « Non à jour » devient un disque et « À jour » casse en deux.
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'border-hairline-strong bg-surface-2 text-muted-foreground',
        brass: 'border-brass/30 bg-brass/10 text-brass',
        jade: 'border-jade/30 bg-jade/12 text-jade',
        amber: 'border-amber/30 bg-amber/12 text-amber',
        // ⚠️ `text-terra-text` / `text-info-text` (jetons plus clairs), PAS `text-terra`/`text-info` :
        // sur un fond de la MÊME teinte, l'accent brut mesure 3.58:1 et 4.21:1 → sous AA. Ce sont
        // les badges « Non à jour » et « Impayée ». Bordure et fond gardent l'accent. Cf. index.css.
        terra: 'border-terra/35 bg-terra/12 text-terra-text',
        info: 'border-info/35 bg-info/12 text-info-text',
      },
      size: {
        // `text-xs` (12 px) et non `text-2xs` (10.9 px) : un badge porte une information MÉTIER
        // (statut de cotisation), pas une décoration. `--text-2xs`/`--text-2xs` restent réservés
        // aux overlines en capitales espacées, qui tolèrent mieux la petite taille.
        // `sm` et `md` partagent volontairement 12 px : ils se distinguent par le PADDING (densité),
        // pas par la lisibilité — descendre `sm` sous 12 px repasserait sous le plancher.
        sm: 'px-2.5 py-0.5 text-xs',
        md: 'px-3 py-1 text-xs',
        lg: 'px-4 py-1.5 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

const DOT: Record<string, string> = {
  neutral: 'bg-muted-foreground',
  brass: 'bg-brass',
  jade: 'bg-jade',
  amber: 'bg-amber',
  terra: 'bg-terra',
  info: 'bg-info',
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  pulse?: boolean
}

export function Badge({ className, tone, size, dot, pulse, children, ...props }: BadgeProps) {
  const dotColor = DOT[tone ?? 'neutral']
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotColor)}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotColor)} />
        </span>
      )}
      {children}
    </span>
  )
}

export default Badge
