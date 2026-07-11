import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Pastille de statut / étiquette. Tons alignés sur la palette Laiton & Jade. */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'border-hairline-strong bg-surface-2 text-muted-foreground',
        brass: 'border-brass/30 bg-brass/10 text-brass',
        jade: 'border-jade/30 bg-jade/12 text-jade',
        amber: 'border-amber/30 bg-amber/12 text-amber',
        terra: 'border-terra/35 bg-terra/12 text-terra',
        info: 'border-info/35 bg-info/12 text-info',
      },
      size: {
        sm: 'px-2.5 py-0.5 text-3xs',
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
        <span className="relative flex h-1.5 w-1.5">
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
