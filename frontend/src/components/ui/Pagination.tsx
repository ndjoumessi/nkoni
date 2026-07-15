import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

/**
 * Contrôles de pagination par offset — primitive PARTAGÉE (audit m4). S'efface d'elle-même quand
 * tout tient sur une page (`total <= pageSize`). Réutilisable par toute liste paginée côté serveur.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
}) {
  const { t } = useTranslation()
  if (total <= pageSize) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const debut = (page - 1) * pageSize + 1
  const fin = Math.min(total, page * pageSize)
  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
      aria-label={t('commun.pagination.label')}
    >
      <span className="text-xs text-faint">
        {t('commun.pagination.intervalle', { debut, fin, total })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('commun.pagination.precedent')}
        </Button>
        <span className="num text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronRight}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('commun.pagination.suivant')}
        </Button>
      </div>
    </nav>
  )
}

export default Pagination
