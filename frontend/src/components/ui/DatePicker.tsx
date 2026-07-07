import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClasses } from './control-styles'

/**
 * Sélecteur de date « Laiton & Jade » — remplace `<input type="date">` natif par un calendrier
 * stylisé, cohérent avec les primitives Input/Select (même `controlClasses` pour le déclencheur).
 *
 * i18n (§4) : noms de mois/jours et format d'affichage suivent la LANGUE d'interface (i18next),
 * via `Intl.DateTimeFormat` — aucune table de libellés en dur, aucune dépendance externe.
 *
 * Accessibilité (§1/§8) : déclencheur `aria-haspopup="dialog"` + `aria-expanded` ; grille
 * `role="grid"` avec cellules `gridcell` ; navigation clavier complète (flèches, Home/End,
 * PageUp/Down, Entrée/Espace, Échap) avec focus roving ; retour du focus au déclencheur à la
 * fermeture. Compatible `<Field>` : reçoit `id`/`aria-invalid`/`aria-describedby` et les porte
 * sur le déclencheur.
 *
 * Contrat de valeur identique au natif : `value` = `yyyy-mm-dd` (ou `yyyy-mm-ddThh:mm` si
 * `withTime`), chaîne vide si non renseigné ; `onChange` reçoit la même forme.
 */

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  /** Ajoute un champ heure (remplace `datetime-local`). `value` devient `yyyy-mm-ddThh:mm`. */
  withTime?: boolean
  disabled?: boolean
  placeholder?: string
  /** Bornes ISO `yyyy-mm-dd` (incluses). En dehors → jour non sélectionnable. */
  min?: string
  max?: string
  className?: string
  // Injectés par <Field> (clonage) :
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}

/** Premier jour de semaine par langue (lundi en fr, dimanche en en). */
const PREMIER_JOUR: Record<string, number> = { fr: 1, en: 0 }

const pad = (n: number) => String(n).padStart(2, '0')
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Parse la partie date d'une valeur (`yyyy-mm-dd…`) en Date locale (midi → insensible au fuseau). */
function parseISODate(s: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Extrait la partie heure (`hh:mm`) d'une valeur `yyyy-mm-ddThh:mm`, sinon chaîne vide. */
const parseTime = (s: string | undefined) => /T(\d{2}:\d{2})/.exec(s ?? '')?.[1] ?? ''

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function DatePicker({
  value,
  onChange,
  withTime = false,
  disabled = false,
  placeholder,
  min,
  max,
  className,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
  const premierJour = PREMIER_JOUR[locale] ?? 1

  const selected = useMemo(() => parseISODate(value), [value])
  const heure = parseTime(value)
  const today = useMemo(() => new Date(), [])
  const minDate = useMemo(() => parseISODate(min), [min])
  const maxDate = useMemo(() => parseISODate(max), [max])

  const [open, setOpen] = useState(false)
  // Mois affiché + jour ayant le focus roving dans la grille.
  const [vue, setVue] = useState<Date>(() => selected ?? today)
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? today)

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Formatteurs Intl mémoïsés selon la langue courante.
  const fmt = useMemo(
    () => ({
      moisAnnee: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      jourCourt: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
      jourLong: new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      affichage: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
    }),
    [locale],
  )

  // En-têtes de colonnes (jours de la semaine), à partir d'un dimanche de référence (2024-01-07).
  const enTetes = useMemo(() => {
    const dimanche = new Date(2024, 0, 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(dimanche, (premierJour + i) % 7)
      return { court: fmt.jourCourt.format(d), key: (premierJour + i) % 7 }
    })
  }, [premierJour, fmt])

  // 42 jours (6 semaines) couvrant le mois affiché, débordements inclus.
  const grille = useMemo(() => {
    const premier = new Date(vue.getFullYear(), vue.getMonth(), 1)
    const decalage = (premier.getDay() - premierJour + 7) % 7
    const debut = addDays(premier, -decalage)
    return Array.from({ length: 42 }, (_, i) => addDays(debut, i))
  }, [vue, premierJour])

  const horsBornes = useCallback(
    (d: Date) => (minDate != null && d < minDate) || (maxDate != null && d > maxDate),
    [minDate, maxDate],
  )

  // À l'ouverture : recale la vue et le focus sur la valeur sélectionnée (ou aujourd'hui).
  useEffect(() => {
    if (!open) return
    const cible = selected ?? today
    setVue(cible)
    setFocusDate(cible)
  }, [open, selected, today])

  // Recale la vue si le focus clavier franchit une frontière de mois.
  useEffect(() => {
    if (!open) return
    if (focusDate.getMonth() !== vue.getMonth() || focusDate.getFullYear() !== vue.getFullYear()) {
      setVue(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1))
    }
  }, [focusDate, open, vue])

  // Donne le focus DOM au jour actif (roving) après chaque déplacement clavier.
  useEffect(() => {
    if (!open) return
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toISODate(focusDate)}"]`)
    el?.focus()
  }, [open, focusDate, grille])

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const fermerEtRendre = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const choisir = useCallback(
    (d: Date) => {
      if (horsBornes(d)) return
      const iso = toISODate(d)
      onChange(withTime ? `${iso}T${heure || '00:00'}` : iso)
      fermerEtRendre()
    },
    [horsBornes, onChange, withTime, heure, fermerEtRendre],
  )

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: Date | null = null
      switch (e.key) {
        case 'ArrowLeft': next = addDays(focusDate, -1); break
        case 'ArrowRight': next = addDays(focusDate, 1); break
        case 'ArrowUp': next = addDays(focusDate, -7); break
        case 'ArrowDown': next = addDays(focusDate, 7); break
        case 'Home': next = addDays(focusDate, -((focusDate.getDay() - premierJour + 7) % 7)); break
        case 'End': next = addDays(focusDate, 6 - ((focusDate.getDay() - premierJour + 7) % 7)); break
        case 'PageUp': next = addMonths(focusDate, -1); break
        case 'PageDown': next = addMonths(focusDate, 1); break
        case 'Enter':
        case ' ':
          e.preventDefault()
          choisir(focusDate)
          return
        case 'Escape':
          e.preventDefault()
          fermerEtRendre()
          return
        default:
          return
      }
      e.preventDefault()
      if (next) setFocusDate(next)
    },
    [focusDate, premierJour, choisir, fermerEtRendre],
  )

  const affichage = selected
    ? `${fmt.affichage.format(selected)}${withTime && heure ? ` · ${heure}` : ''}`
    : (placeholder ?? t('ui.datePicker.placeholder'))

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((o) => !o)}
        className={cn(controlClasses, 'flex items-center justify-between gap-2 text-left')}
      >
        <span className={cn('truncate', !selected && 'text-faint')}>{affichage}</span>
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('ui.datePicker.dialogue')}
          aria-modal="false"
          className="nk-toast-in absolute left-0 top-[calc(100%+0.4rem)] z-40 w-[19rem] rounded-2xl border border-hairline bg-canvas p-3 shadow-xl"
        >
          {/* En-tête : navigation de mois */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t('ui.datePicker.moisPrecedent')}
              onClick={() => setVue((v) => addMonths(v, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-display text-sm font-semibold capitalize text-foreground" aria-live="polite">
              {fmt.moisAnnee.format(vue)}
            </span>
            <button
              type="button"
              aria-label={t('ui.datePicker.moisSuivant')}
              onClick={() => setVue((v) => addMonths(v, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Grille des jours */}
          <div role="grid" ref={gridRef} onKeyDown={onGridKeyDown}>
            <div role="row" className="mb-1 grid grid-cols-7">
              {enTetes.map((h) => (
                <span
                  key={h.key}
                  role="columnheader"
                  className="py-1 text-center text-[0.65rem] font-medium uppercase tracking-wide text-faint"
                >
                  {h.court}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grille.map((d) => {
                const estMois = d.getMonth() === vue.getMonth()
                const estSel = selected != null && sameDay(d, selected)
                const estToday = sameDay(d, today)
                const desactive = horsBornes(d)
                const estFocus = sameDay(d, focusDate)
                return (
                  <div role="gridcell" key={toISODate(d)} aria-selected={estSel}>
                    <button
                      type="button"
                      data-iso={toISODate(d)}
                      tabIndex={estFocus ? 0 : -1}
                      disabled={desactive}
                      aria-label={fmt.jourLong.format(d)}
                      aria-current={estToday ? 'date' : undefined}
                      onClick={() => choisir(d)}
                      className={cn(
                        'flex h-9 w-full items-center justify-center rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60',
                        !estMois && 'text-faint',
                        estMois && !estSel && 'text-foreground hover:bg-surface-2',
                        estSel && 'bg-brass font-semibold text-canvas hover:bg-brass',
                        estToday && !estSel && 'ring-1 ring-inset ring-jade/50',
                        desactive && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                      )}
                    >
                      {d.getDate()}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pied : heure (mode withTime) + raccourci aujourd'hui */}
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
            {withTime ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t('ui.datePicker.heure')}</span>
                <input
                  type="time"
                  value={heure}
                  onChange={(e) => {
                    const base = selected ?? today
                    onChange(`${toISODate(base)}T${e.target.value || '00:00'}`)
                  }}
                  className="rounded-lg border border-hairline-strong bg-surface-2/70 px-2 py-1 text-sm text-foreground focus:border-brass/50 focus:outline-none"
                />
              </label>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => choisir(today)}
              disabled={horsBornes(today)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-brass transition-colors hover:bg-brass/10 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
            >
              {t('ui.datePicker.aujourdhui')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DatePicker
