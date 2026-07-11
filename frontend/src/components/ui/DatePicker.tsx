import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClasses, navButtonClasses } from './control-styles'
import { usePopoverFlottant } from './usePopoverFlottant'
import { GrilleAnnees } from './GrilleAnnees'

/**
 * Sélecteur de date « Menthe & Encre » — remplace `<input type="date">` natif par un calendrier
 * stylisé, cohérent avec les primitives Input/Select (même `controlClasses` pour le déclencheur).
 *
 * i18n (§4) : noms de mois/jours et format d'affichage suivent la LANGUE d'interface (i18next),
 * via `Intl.DateTimeFormat` — aucune table de libellés en dur, aucune dépendance externe.
 *
 * Sélection rapide : l'en-tête (« Février 2027 ») est cliquable et ouvre une navigation en deux
 * temps — grille d'ANNÉES (décennie, avec ‹ / › de décennie) → grille des 12 MOIS de l'année
 * choisie → retour au calendrier positionné sur ce mois/année. Évite de marteler ‹ / › mois à mois.
 *
 * Accessibilité (§1/§8) : déclencheur `aria-haspopup="dialog"` + `aria-expanded` ; grilles
 * `role="grid"` ; navigation clavier complète (flèches, Home/End, PageUp/Down, Entrée/Espace, Échap)
 * avec focus roving dans CHAQUE vue ; Échap remonte d'un niveau (mois → années → jours) puis ferme ;
 * retour du focus au déclencheur à la fermeture. Compatible `<Field>` : reçoit
 * `id`/`aria-invalid`/`aria-describedby` et les porte sur le déclencheur.
 *
 * Positionnement : le popover est rendu en PORTAIL dans `<body>` (`createPortal`) et positionné
 * en `position: fixed` d'après le rect du champ (recalculé au scroll/resize/changement de vue). Il
 * échappe ainsi à tout contexte d'empilement d'un bloc frère (nk-reveal `forwards`, transform,
 * z-index élevé…) qui recouvrirait sinon un popover `absolute` — immunité STRUCTURELLE.
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

/** Vue active du popover : calendrier, grille d'années, grille de mois. */
type Panneau = 'jours' | 'annees' | 'mois'

/** Premier jour de semaine par langue (lundi en fr, dimanche en en). */
const PREMIER_JOUR: Record<string, number> = { fr: 1, en: 0 }

/** Classes du libellé central cliquable de l'en-tête (mois/année → ouvre la sélection rapide). */
const LABEL_BTN =
  'rounded-lg px-2.5 py-1 font-display text-sm font-semibold capitalize text-foreground transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60'

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
const dernierJourDuMois = (annee: number, mois: number) => new Date(annee, mois + 1, 0).getDate()
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
  // Mois affiché + jour ayant le focus roving dans la grille de jours.
  const [vue, setVue] = useState<Date>(() => selected ?? today)
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? today)

  // Sélection rapide : vue active + focus roving propre aux panneaux années/mois.
  const [panneau, setPanneau] = useState<Panneau>('jours')
  const [focusAnnee, setFocusAnnee] = useState<number>(() => (selected ?? today).getFullYear())
  const [ancreAnnee, setAncreAnnee] = useState<number>(() => (selected ?? today).getFullYear())
  const [focusMois, setFocusMois] = useState<number>(() => (selected ?? today).getMonth())

  // Quand true, l'effet de focus roving NE déplace PAS le focus DOM vers une cellule. Posé par les
  // flèches ‹ / › de l'en-tête (mois) et de décennie (dans `GrilleAnnees`) : elles changent
  // `focusDate`/`focusAnnee` mais le focus doit RESTER sur le bouton (sinon on le vole vers une
  // cellule et l'activation clavier répétée du bouton casse).
  const conserverFocusRef = useRef(false)

  // Infrastructure du popover flottant (portail + `position: fixed` + clic extérieur + Échap),
  // PARTAGÉE avec SelecteurAnnee. `repositionSur: panneau` → recalcule quand la vue (donc la
  // hauteur) change.
  const { containerRef, triggerRef, popoverRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: () => setOpen(false),
    largeurDefaut: 304,
    hauteurDefaut: 380,
    repositionSur: panneau,
  })

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
      moisCourt: new Intl.DateTimeFormat(locale, { month: 'short' }),
      moisLong: new Intl.DateTimeFormat(locale, { month: 'long' }),
      affichage: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
    }),
    [locale],
  )

  // Noms des 12 mois (court pour la cellule, long pour l'aria-label), selon la locale.
  const moisNoms = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        court: fmt.moisCourt.format(new Date(2000, m, 1)),
        long: fmt.moisLong.format(new Date(2000, m, 1)),
      })),
    [fmt],
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

  // Décennie affichée par le panneau années (source de vérité `focusAnnee`) — pour l'annonce
  // sr-only ; la grille elle-même est rendue par `GrilleAnnees`.
  const decennieBase = Math.floor(focusAnnee / 10) * 10
  // Bornes en ANNÉES pour `GrilleAnnees` (±Infinity = pas de borne quand min/max absents).
  const anneeMin = minDate ? minDate.getFullYear() : -Infinity
  const anneeMax = maxDate ? maxDate.getFullYear() : Infinity

  const horsBornes = useCallback(
    (d: Date) => (minDate != null && d < minDate) || (maxDate != null && d > maxDate),
    [minDate, maxDate],
  )

  // Bornes pour les panneaux de sélection rapide (années/mois) — cohérent avec la grille des jours
  // et `SelecteurAnnee`. Une année/un mois entièrement hors de [minDate, maxDate] est désactivé(e),
  // pour ne pas déposer l'utilisateur sur un mois où tous les jours sont désactivés (cul-de-sac).
  const anneeHorsBornes = useCallback(
    (annee: number) =>
      (minDate != null && annee < minDate.getFullYear()) ||
      (maxDate != null && annee > maxDate.getFullYear()),
    [minDate, maxDate],
  )
  const moisHorsBornes = useCallback(
    (annee: number, mois: number) =>
      (minDate != null &&
        (annee < minDate.getFullYear() ||
          (annee === minDate.getFullYear() && mois < minDate.getMonth()))) ||
      (maxDate != null &&
        (annee > maxDate.getFullYear() ||
          (annee === maxDate.getFullYear() && mois > maxDate.getMonth()))),
    [minDate, maxDate],
  )

  // À l'ouverture : recale la vue, le focus et les panneaux sur la valeur sélectionnée (ou aujourd'hui).
  useEffect(() => {
    if (!open) return
    const cible = selected ?? today
    setVue(cible)
    setFocusDate(cible)
    setPanneau('jours')
    setFocusAnnee(cible.getFullYear())
    setAncreAnnee(cible.getFullYear())
    setFocusMois(cible.getMonth())
  }, [open, selected, today])

  // Recale la vue si le focus clavier (jours) franchit une frontière de mois.
  useEffect(() => {
    if (!open) return
    if (focusDate.getMonth() !== vue.getMonth() || focusDate.getFullYear() !== vue.getFullYear()) {
      setVue(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1))
    }
  }, [focusDate, open, vue])

  // Donne le focus DOM à la cellule active (roving) de la vue courante, après chaque déplacement.
  // `preventScroll` : le popover étant en portail dans <body>, un focus classique pourrait faire
  // défiler la page vers lui — on l'évite.
  useEffect(() => {
    if (!open) return
    // Navigation via les flèches d'en-tête : garder le focus sur le bouton, ne pas le voler.
    if (conserverFocusRef.current) {
      conserverFocusRef.current = false
      return
    }
    const sel =
      panneau === 'jours'
        ? `[data-iso="${toISODate(focusDate)}"]`
        : panneau === 'annees'
          ? `[data-annee="${focusAnnee}"]`
          : `[data-mois="${focusMois}"]`
    popoverRef.current?.querySelector<HTMLButtonElement>(sel)?.focus({ preventScroll: true })
  }, [open, panneau, focusDate, focusAnnee, focusMois, grille, popoverRef])

  // Navigation de mois (boutons ‹ / › de la vue jours) : on déplace `vue` ET `focusDate` du même
  // pas, de façon SYNCHRONE. (1) `vue` change tout de suite → l'en-tête se met à jour dans le même
  // rendu (pas de lag) ; (2) en gardant `focusDate.mois === vue.mois`, l'effet de recalage reste un
  // no-op et n'ANNULE plus le clic (régression corrigée). Jour borné à la longueur du mois cible.
  const allerAuMois = useCallback((delta: number) => {
    conserverFocusRef.current = true // garder le focus sur la flèche ‹ / › (cf. effet roving)
    setVue((v) => addMonths(v, delta))
    setFocusDate((f) => {
      const annee = f.getFullYear()
      const mois = f.getMonth() + delta
      return new Date(annee, mois, Math.min(f.getDate(), dernierJourDuMois(annee, mois)))
    })
  }, [])

  const fermerEtRendre = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [triggerRef])

  const choisir = useCallback(
    (d: Date) => {
      if (horsBornes(d)) return
      const iso = toISODate(d)
      onChange(withTime ? `${iso}T${heure || '00:00'}` : iso)
      fermerEtRendre()
    },
    [horsBornes, onChange, withTime, heure, fermerEtRendre],
  )

  // --- Sélection rapide : transitions entre panneaux ---
  const ouvrirAnnees = useCallback(() => {
    setFocusAnnee(vue.getFullYear())
    setPanneau('annees')
  }, [vue])

  const choisirAnnee = useCallback(
    (annee: number) => {
      if (anneeHorsBornes(annee)) return
      setAncreAnnee(annee)
      setFocusMois(vue.getMonth())
      setPanneau('mois')
    },
    [vue, anneeHorsBornes],
  )

  // Année ‹ / › de la vue mois : change l'année ancre (les 12 mois affichés).
  const changerAnneePanneau = useCallback((delta: number) => setAncreAnnee((a) => a + delta), [])

  const retourAnnees = useCallback(() => {
    setFocusAnnee(ancreAnnee)
    setPanneau('annees')
  }, [ancreAnnee])

  const retourJours = useCallback(() => setPanneau('jours'), [])

  // Sélection d'un mois → retour au calendrier. On pose `vue` ET `focusDate` ENSEMBLE (même mois)
  // pour que l'effet de recalage reste un no-op (cf. `allerAuMois`).
  const choisirMois = useCallback(
    (mois: number) => {
      if (moisHorsBornes(ancreAnnee, mois)) return
      setVue(new Date(ancreAnnee, mois, 1))
      setFocusDate((f) =>
        new Date(ancreAnnee, mois, Math.min(f.getDate(), dernierJourDuMois(ancreAnnee, mois))),
      )
      setPanneau('jours')
    },
    [ancreAnnee, moisHorsBornes],
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

  // Clavier de la grille des mois (3 colonnes). PageUp/Down changent d'année ; Échap → années.
  const onMoisKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let m = focusMois
      switch (e.key) {
        case 'ArrowLeft': m = Math.max(0, m - 1); break
        case 'ArrowRight': m = Math.min(11, m + 1); break
        case 'ArrowUp': m = Math.max(0, m - 3); break
        case 'ArrowDown': m = Math.min(11, m + 3); break
        case 'PageUp':
          e.preventDefault()
          changerAnneePanneau(-1)
          return
        case 'PageDown':
          e.preventDefault()
          changerAnneePanneau(1)
          return
        case 'Enter':
        case ' ':
          e.preventDefault()
          choisirMois(focusMois)
          return
        case 'Escape':
          e.preventDefault()
          retourAnnees()
          return
        default:
          return
      }
      e.preventDefault()
      setFocusMois(m)
    },
    [focusMois, changerAnneePanneau, choisirMois, retourAnnees],
  )

  const affichage = selected
    ? `${fmt.affichage.format(selected)}${withTime && heure ? ` · ${heure}` : ''}`
    : (placeholder ?? t('ui.datePicker.placeholder'))

  // Valeur annoncée aux lecteurs d'écran (région live dédiée, cf. plus bas) : mois/décennie/année
  // selon la vue. Portée par un élément `sr-only` SANS aria-label, pour que l'annonce suive vraiment
  // le CHANGEMENT de contenu (un aria-label sur le bouton d'en-tête masquerait l'annonce live).
  const texteLive =
    panneau === 'jours'
      ? fmt.moisAnnee.format(vue)
      : panneau === 'annees'
        ? `${decennieBase} – ${decennieBase + 9}`
        : String(ancreAnnee)

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
        rendreFlottant(
          <>
            {/* Région live dédiée : annonce la vue courante (mois/décennie/année) à chaque
                navigation, y compris via les flèches ‹ / › (le focus reste sur le bouton). */}
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {texteLive}
            </span>

            {/* En-tête contextuel (jours / mois). Le panneau années porte son propre en-tête via
                `GrilleAnnees`. */}
            {panneau !== 'annees' && (
              <div className="mb-2 flex items-center justify-between">
                {panneau === 'jours' && (
                  <>
                    <button type="button" aria-label={t('ui.datePicker.moisPrecedent')} onClick={() => allerAuMois(-1)} className={navButtonClasses}>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('ui.datePicker.choisirMoisAnnee')}
                      onClick={ouvrirAnnees}
                      className={LABEL_BTN}
                    >
                      {fmt.moisAnnee.format(vue)}
                    </button>
                    <button type="button" aria-label={t('ui.datePicker.moisSuivant')} onClick={() => allerAuMois(1)} className={navButtonClasses}>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
                {panneau === 'mois' && (
                  <>
                    <button type="button" aria-label={t('ui.datePicker.anneePrecedente')} onClick={() => changerAnneePanneau(-1)} className={navButtonClasses}>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('ui.datePicker.choisirAnnee')}
                      onClick={retourAnnees}
                      className={cn(LABEL_BTN, 'num')}
                    >
                      {ancreAnnee}
                    </button>
                    <button type="button" aria-label={t('ui.datePicker.anneeSuivante')} onClick={() => changerAnneePanneau(1)} className={navButtonClasses}>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Corps : calendrier, ou grille d'années, ou grille de mois */}
            {panneau === 'jours' && (
              <>
                <div role="grid" onKeyDown={onGridKeyDown}>
                  <div role="row" className="mb-1 grid grid-cols-7">
                    {enTetes.map((h) => (
                      <span key={h.key} role="columnheader" className="py-1 text-center text-3xs font-medium uppercase tracking-wide text-faint">
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
              </>
            )}

            {panneau === 'annees' && (
              <GrilleAnnees
                focusAnnee={focusAnnee}
                setFocusAnnee={setFocusAnnee}
                min={anneeMin}
                max={anneeMax}
                valeurSelectionnee={selected?.getFullYear() ?? null}
                anneeCourante={today.getFullYear()}
                conserverFocusRef={conserverFocusRef}
                onChoisir={choisirAnnee}
                onEchap={retourJours}
                labelPrecedente={t('ui.datePicker.decenniePrecedente')}
                labelSuivante={t('ui.datePicker.decennieSuivante')}
              />
            )}

            {panneau === 'mois' && (
              <div role="grid" onKeyDown={onMoisKeyDown} className="grid grid-cols-3 gap-1 py-1">
                {moisNoms.map((nom, m) => {
                  const estSel =
                    selected != null && selected.getFullYear() === ancreAnnee && selected.getMonth() === m
                  const estCourant = today.getFullYear() === ancreAnnee && today.getMonth() === m
                  const estFocus = m === focusMois
                  const desactive = moisHorsBornes(ancreAnnee, m)
                  return (
                    <button
                      key={m}
                      type="button"
                      data-mois={m}
                      tabIndex={estFocus ? 0 : -1}
                      disabled={desactive}
                      aria-label={nom.long}
                      onClick={() => choisirMois(m)}
                      className={cn(
                        'flex h-12 items-center justify-center rounded-lg text-sm capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60',
                        !estSel && 'text-foreground hover:bg-surface-2',
                        estSel && 'bg-brass font-semibold text-canvas hover:bg-brass',
                        estCourant && !estSel && 'ring-1 ring-inset ring-jade/50',
                        desactive && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                      )}
                    >
                      {nom.court}
                    </button>
                  )
                })}
              </div>
            )}
          </>,
          {
            className: 'nk-toast-in z-50 w-[19rem] rounded-2xl border border-hairline bg-canvas p-3 shadow-xl',
            'aria-label': t('ui.datePicker.dialogue'),
          },
        )}
    </div>
  )
}

export default DatePicker
