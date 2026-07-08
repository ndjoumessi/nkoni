import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClasses } from './control-styles'

/**
 * Sélecteur d'ANNÉE « Menthe & Encre » — pour les cas où seule l'année a un sens (ex. barème
 * annuel), sans la complexité jours/mois d'un calendrier. Reprend l'esprit du `DatePicker` :
 * déclencheur `controlClasses`, popover en PORTAIL dans `<body>` positionné en `position: fixed`
 * (immunité aux contextes d'empilement — cf. `DatePicker`), grille d'années par décennie avec
 * ‹ / › de décennie, focus roving + navigation clavier, mêmes jetons de couleur et transitions.
 *
 * Contrat : `value` = année (nombre), `onChange(annee)` reçoit une année TOUJOURS dans [min, max]
 * (les cellules hors bornes sont désactivées). Compatible `<Field>` : reçoit `id`/`aria-invalid`/
 * `aria-describedby` et les porte sur le déclencheur.
 */

type SelecteurAnneeProps = {
  value: number
  onChange: (annee: number) => void
  /** Bornes incluses. Défauts alignés sur la validation barème (§5). */
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  // Injectés par <Field> (clonage) :
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}

const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60'

const borner = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function SelecteurAnnee({
  value,
  onChange,
  min = 1900,
  max = 2200,
  disabled = false,
  className,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SelecteurAnneeProps) {
  const { t } = useTranslation()
  const today = useMemo(() => new Date().getFullYear(), [])

  const [open, setOpen] = useState(false)
  const [focusAnnee, setFocusAnnee] = useState<number>(() => borner(value, min, max))
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Décennie de `focusAnnee` (source de vérité unique) + 1 an de débordement de chaque côté.
  const decennieBase = Math.floor(focusAnnee / 10) * 10
  const anneesGrille = useMemo(
    () => Array.from({ length: 12 }, (_, i) => decennieBase - 1 + i),
    [decennieBase],
  )
  const horsBornes = useCallback((annee: number) => annee < min || annee > max, [min, max])

  // Positionnement viewport (`position: fixed`) depuis le rect du champ — identique au DatePicker.
  const positionner = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const gap = 8
    const largeur = popoverRef.current?.offsetWidth ?? 240
    const hauteur = popoverRef.current?.offsetHeight ?? 220
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    let top = r.bottom + gap
    if (r.bottom + gap + hauteur > vh && r.top > vh - r.bottom) {
      top = Math.max(gap, r.top - gap - hauteur)
    }
    const left = Math.max(gap, Math.min(r.left, vw - largeur - gap))
    setCoords({ top, left })
  }, [])

  // À l'ouverture : recale le focus roving sur la valeur (bornée).
  useEffect(() => {
    if (open) setFocusAnnee(borner(value, min, max))
  }, [open, value, min, max])

  // Focus DOM sur la cellule active (roving), sans faire défiler la page (popover en portail).
  useEffect(() => {
    if (!open) return
    popoverRef.current
      ?.querySelector<HTMLButtonElement>(`[data-annee="${focusAnnee}"]`)
      ?.focus({ preventScroll: true })
  }, [open, focusAnnee])

  // (Re)positionne à l'ouverture, au scroll (capture) et au resize.
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

  // Fermeture au clic extérieur (le popover en portail est épargné explicitement).
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

  const fermerEtRendre = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const choisir = useCallback(
    (annee: number) => {
      if (horsBornes(annee)) return
      onChange(annee)
      fermerEtRendre()
    },
    [horsBornes, onChange, fermerEtRendre],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let n = focusAnnee
      switch (e.key) {
        case 'ArrowLeft': n -= 1; break
        case 'ArrowRight': n += 1; break
        case 'ArrowUp': n -= 4; break
        case 'ArrowDown': n += 4; break
        case 'PageUp': n -= 10; break
        case 'PageDown': n += 10; break
        case 'Home': n = min; break
        case 'End': n = max; break
        case 'Enter':
        case ' ':
          e.preventDefault()
          choisir(focusAnnee)
          return
        case 'Escape':
          e.preventDefault()
          fermerEtRendre()
          return
        default:
          return
      }
      e.preventDefault()
      setFocusAnnee(borner(n, min, max))
    },
    [focusAnnee, min, max, choisir, fermerEtRendre],
  )

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
        <span className="num">{value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t('ui.selecteurAnnee.dialogue')}
            aria-modal="false"
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? 'visible' : 'hidden',
            }}
            className="nk-toast-in z-50 w-[15rem] rounded-2xl border border-hairline bg-canvas p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={t('ui.selecteurAnnee.decenniePrecedente')}
                onClick={() => setFocusAnnee((y) => borner(y - 10, min, max))}
                className={NAV_BTN}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="font-display text-sm font-semibold text-foreground" aria-live="polite">
                {decennieBase} – {decennieBase + 9}
              </span>
              <button
                type="button"
                aria-label={t('ui.selecteurAnnee.decennieSuivante')}
                onClick={() => setFocusAnnee((y) => borner(y + 10, min, max))}
                className={NAV_BTN}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div role="grid" onKeyDown={onKeyDown} className="grid grid-cols-4 gap-1 py-1">
              {anneesGrille.map((annee) => {
                const dansDecennie = annee >= decennieBase && annee <= decennieBase + 9
                const estSel = annee === value
                const estCourante = annee === today
                const estFocus = annee === focusAnnee
                const desactive = horsBornes(annee)
                return (
                  <button
                    key={annee}
                    type="button"
                    data-annee={annee}
                    tabIndex={estFocus ? 0 : -1}
                    disabled={desactive}
                    aria-current={estCourante ? 'date' : undefined}
                    onClick={() => choisir(annee)}
                    className={cn(
                      'num flex h-11 items-center justify-center rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60',
                      !dansDecennie && 'text-faint',
                      dansDecennie && !estSel && 'text-foreground hover:bg-surface-2',
                      estSel && 'bg-brass font-semibold text-canvas hover:bg-brass',
                      estCourante && !estSel && 'ring-1 ring-inset ring-jade/50',
                      desactive && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                    )}
                  >
                    {annee}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default SelecteurAnnee
