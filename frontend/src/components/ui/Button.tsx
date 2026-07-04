import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Bouton NKONI — variantes cohérentes dans toute l'app.
 * `brass` = action primaire (rare), `outline`/`ghost` = secondaire, `danger` = destructif.
 */
const buttonVariants = cva(
  'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-150 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        brass:
          'bg-brass text-brass-foreground shadow-[0_1px_0_oklch(1_0_0/25%)_inset,0_8px_20px_-8px_oklch(0.805_0.116_84/45%)] hover:brightness-[1.06] active:brightness-95',
        outline:
          'border border-hairline-strong bg-surface-2/60 text-foreground hover:border-brass/40 hover:bg-surface-3',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        danger:
          'border border-terra/30 bg-terra/10 text-terra hover:bg-terra/15',
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

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  icon?: LucideIcon
  loading?: boolean
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonBaseProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, icon: Icon, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

/** Même apparence que Button, mais rend un <Link> de react-router. */
export interface ButtonLinkProps
  extends Omit<LinkProps, 'className'>,
    ButtonBaseProps {
  className?: string
}

export function ButtonLink({
  className,
  variant,
  size,
  icon: Icon,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </Link>
  )
}

export default Button
