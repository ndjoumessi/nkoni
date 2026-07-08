import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 * Positionnement : le popover est rendu en PORTAIL dans `<body>` (`createPortal`) et positionné
 * en `position: fixed` d'après le rect du champ (recalculé au scroll/resize). Il échappe ainsi à
 * tout contexte d'empilement d'un bloc frère (nk-reveal `forwards`, transform, z-index élevé…)
 * qui recouvrirait sinon un popover simplement `absolute` — immunité STRUCTURELLE, pas au cas par cas.
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
  const popoverRef = useRef<HTMLDivElement>(null)

  // Position du popover en coordonnées VIEWPORT (`position: fixed`). Le calendrier est rendu en
  // PORTAIL dans <body> (cf. plus bas) et positionné ici à partir du rect du champ : il échappe
  // ainsi à tout contexte d'empilement créé par un bloc frère (nk-reveal, transform, z-index…)
  // qui, sinon, le recouvrirait — bug structurel corrigé à la racine.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // Ancre le popover sous le champ (ou au-dessus s'il n'y a pas la place), borné au viewport.
  const positionner = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const gap = 8
    const largeur = popoverRef.current?.offsetWidth ?? 304
    const hauteur = popoverRef.current?.offsetHeight ?? 380
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight

    // Vertical : sous le champ par défaut ; bascule au-dessus si pas la place en bas ET plus haut.
    let top = r.bottom + gap
    if (r.bottom + gap + hauteur > vh && r.top > vh - r.bottom) {
      top = Math.max(gap, r.top - gap - hauteur)
    }
    // Horizontal : aligné au bord gauche du champ, borné pour ne jamais sortir de l'écran.
    const left = Math.max(gap, Math.min(r.left, vw - largeur - gap))

    setCoords({ top, left })
  }, [])

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
  // `preventScroll` : le popover étant en portail dans <body>, un focus classique pourrait
  // faire défiler la page vers lui — on l'évite.
  useEffect(() => {
    if (!open) return
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toISODate(focusDate)}"]`)
    el?.focus({ preventScroll: true })
  }, [open, focusDate, grille])

  // (Re)positionne le popover à l'ouverture, puis au scroll (capture → n'importe quel conteneur
  // défilant) et au resize, tant qu'il est ouvert. `useLayoutEffect` : calcule AVANT la peinture
  // (pas de saut visuel ; le popover reste masqué tant que `coords` est nul).
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    positionner()
    const surMaj = () => positionner()
    window.addEventListener('scroll', surMaj, true)
    window.addEventListener('resize', surMaj)
    return () => {
      window.removeEventListener('scroll', surMaj, true)
      window.removeEventListener('resize', surMaj)
    }
  }, [open, positionner])

  // Fermeture au clic extérieur. Le popover vivant dans un PORTAIL (hors de containerRef), on
  // l'épargne explicitement : sinon un mousedown sur un jour fermerait le calendrier AVANT le
  // click → sélection cassée.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const cible = e.target as Node
      if (containerRef.current?.contains(cible) || popoverRef.current?.contains(cible)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Navigation de mois (boutons ‹ / ›) : on déplace `vue` ET `focusDate` du même pas, de façon
  // SYNCHRONE. Deux raisons : (1) `vue` change tout de suite → l'en-tête se met à jour dans le
  // même rendu (pas de lag d'une frame le temps qu'un effet propage) ; (2) en gardant
  // `focusDate.mois === vue.mois`, l'effet de recalage (focusDate → vue) reste un no-op et
  // n'ANNULE plus le clic (bug : avant, seul `vue` bougeait, l'effet le ramenait au mois du focus).
  // Le jour de `focusDate` est borné à la longueur du mois cible.
  const allerAuMois = useCallback((delta: number) => {
    setVue((v) => addMonths(v, delta))
    setFocusDate((f) => {
      const annee = f.getFullYear()
      const mois = f.getMonth() + delta
      const dernierJour = new Date(annee, mois + 1, 0).getDate()
      return new Date(annee, mois, Math.min(f.getDate(), dernierJour))
    })
  }, [])

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

      {open &&
        createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t('ui.datePicker.dialogue')}
          aria-modal="false"
          style={{
            position: 'fixed',
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            // Masqué tant que la position n'est pas calculée (évite un flash en haut à gauche).
            visibility: coords ? 'visible' : 'hidden',
          }}
          className="nk-toast-in z-50 w-[19rem] rounded-2xl border border-hairline bg-canvas p-3 shadow-xl"
        >
          {/* En-tête : navigation de mois */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t('ui.datePicker.moisPrecedent')}
              onClick={() => allerAuMois(-1)}
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
              onClick={() => allerAuMois(1)}
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
        </div>,
          document.body,
        )}
    </div>
  )
}

export default DatePicker
