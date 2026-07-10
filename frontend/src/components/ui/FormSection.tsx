import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Regroupe des champs de formulaire dans un panneau légèrement distinct, avec une
 * étiquette de section (icône + titre) — donne une vraie structure à une grille de
 * champs au lieu de « deux champs côte à côte » sans lien.
 */
export function FormSection({
  icon: Icon,
  title,
  children,
  columns = 2,
  className,
}: {
  icon?: LucideIcon
  title: string
  children: ReactNode
  columns?: 1 | 2
  className?: string
}) {
  // `@container` + variante `@lg:` : la grille réagit à la largeur de la SECTION (pas du viewport).
  // Deux colonnes seulement quand la section est assez large (formulaire pleine largeur) ; en
  // conteneur étroit (modale) elle reste sur une colonne → plus de champs tronqués / labels coupés.
  return (
    <section
      className={cn('@container rounded-2xl border border-hairline bg-surface-2/30 p-4 sm:p-5', className)}
    >
      <p className="mb-4 flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">
        {Icon && <Icon className="h-3.5 w-3.5 text-brass" aria-hidden="true" />}
        {title}
      </p>
      <div className={cn('grid gap-4', columns === 2 && '@lg:grid-cols-2')}>{children}</div>
    </section>
  )
}

export default FormSection
