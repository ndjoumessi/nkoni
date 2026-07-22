import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Table de données dense (guideline ui-ux-pro-max §10 « Data-Dense Dashboard ») :
 * `<table>` sémantique, en-tête STICKY, colonnes triables avec `aria-sort`, chiffres
 * tabulaires, filets discrets (gridline-subtle), hover de ligne, lignes cliquables
 * (href) et lignes dépliables optionnelles. Densité : hauteur de ligne ~40px.
 */

export type SortDir = 'asc' | 'desc'

export interface Column<T> {
  key: string
  header: ReactNode
  /** Rendu d'une cellule. */
  cell: (row: T) => ReactNode
  sortable?: boolean
  /** Colonne numérique → alignée à droite + chiffres tabulaires. */
  numeric?: boolean
  align?: 'left' | 'right' | 'center'
  /** Largeur CSS optionnelle (ex. '8rem', '1fr' non supporté ici — px/rem/%). */
  width?: string
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Tri contrôlé (colonne active + sens). */
  sort?: { col: string; dir: SortDir }
  onSort?: (col: string) => void
  /** Rend chaque ligne cliquable → navigation. La 1re cellule reste focusable au clavier. */
  rowHref?: (row: T) => string
  /** Contenu déplié d'une ligne (null = pas de bouton détails pour cette ligne). */
  expandable?: (row: T) => ReactNode | null
  /** Classe optionnelle appliquée par ligne (ex. dé-emphaser une ligne annulée/inactive). */
  rowClassName?: (row: T) => string
  /** Légende lue par les lecteurs d'écran. */
  caption?: string
  className?: string
}

function alignClass(col: { numeric?: boolean; align?: 'left' | 'right' | 'center' }): string {
  const a = col.align ?? (col.numeric ? 'right' : 'left')
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  rowHref,
  expandable,
  rowClassName,
  caption,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const nbCols = columns.length + (expandable ? 1 : 0)

  const toggle = (k: string) =>
    setOuverts((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    // `overflow-x-auto` (mobile) fait de ce bloc un conteneur de défilement qui neutralise le
    // `sticky` de l'en-tête ; en desktop on repasse en `visible` → l'en-tête colle au viewport
    // sur les longues listes (audit UI). Scroll horizontal conservé sous md.
    <div className={cn('overflow-x-auto md:overflow-visible', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10">
          <tr className="bg-surface/95 backdrop-blur">
            {columns.map((col) => {
              const actif = sort?.col === col.key
              const ariaSort = !col.sortable
                ? undefined
                : actif
                  ? sort?.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              const Icon = !actif ? ChevronsUpDown : sort?.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'border-b border-hairline-strong px-4 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-faint',
                    alignClass(col),
                    col.headerClassName,
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      aria-label={`${t('ui.table.trierPar', {
                        col: typeof col.header === 'string' ? col.header : col.key,
                      })}${actif ? (sort?.dir === 'asc' ? t('ui.table.croissant') : t('ui.table.decroissant')) : ''}`}
                      className={cn(
                        'group inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-foreground',
                        col.numeric && 'flex-row-reverse',
                        actif && 'text-brass',
                      )}
                    >
                      {col.header}
                      <Icon
                        className={cn('h-3 w-3', actif ? 'opacity-100' : 'opacity-30 group-hover:opacity-70')}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
            {expandable && <th scope="col" className="w-10 border-b border-hairline-strong" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row)
            const href = rowHref?.(row)
            const detail = expandable?.(row)
            const ouvert = ouverts.has(k)
            return (
              <Fragment key={k}>
                <tr
                  onClick={href ? () => navigate(href) : undefined}
                  className={cn(
                    'border-b border-hairline transition-colors',
                    href && 'cursor-pointer',
                    'hover:bg-surface-2/60',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-2.5 align-middle',
                        alignClass(col),
                        col.numeric && 'num',
                        col.cellClassName,
                      )}
                    >
                      {/* 1re cellule = lien réel (focus clavier + lecteur d'écran) si href. */}
                      {i === 0 && href ? (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault()
                            navigate(href)
                          }}
                          className="rounded outline-none focus-visible:ring-2 focus-visible:ring-brass"
                        >
                          {col.cell(row)}
                        </a>
                      ) : (
                        col.cell(row)
                      )}
                    </td>
                  ))}
                  {expandable && (
                    <td className="px-2 py-2.5 text-right">
                      {detail != null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(k)
                          }}
                          aria-expanded={ouvert}
                          aria-label={ouvert ? t('ui.table.masquerDetails') : t('ui.table.afficherDetails')}
                          className="tap-target inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground"
                        >
                          <ChevronDown
                            className={cn('h-4 w-4 transition-transform', ouvert && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {expandable && ouvert && detail != null && (
                  <tr className="border-b border-hairline bg-surface-2/30">
                    <td colSpan={nbCols} className="px-4 pb-4 pt-1">
                      {detail}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable
