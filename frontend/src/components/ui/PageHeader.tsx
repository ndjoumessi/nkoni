import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** En-tête de page cohérent : lien retour optionnel, sur-titre, titre serif, actions. */
export function PageHeader({
  title,
  overline,
  description,
  back,
  actions,
  className,
}: {
  title: ReactNode
  overline?: string
  description?: ReactNode
  back?: { to: string; label: string }
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('nk-reveal nk-d1', className)}>
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className={cn('flex flex-wrap items-start justify-between gap-4', back && 'mt-4')}>
        <div className="min-w-0">
          {overline && (
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.14em] text-brass/80">
              {overline}
            </p>
          )}
          <h1 className="mt-1 text-balance font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <div className="mt-1.5 text-pretty break-words text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  )
}

export default PageHeader
