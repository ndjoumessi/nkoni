import { type VariantProps } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

/**
 * Bouton NKONI — variantes cohérentes dans toute l'app (styles dans ./button-variants).
 */

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
      aria-busy={loading || undefined}
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
