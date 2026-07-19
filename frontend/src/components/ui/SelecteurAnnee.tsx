import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClasses } from './control-styles'
import { usePopoverFlottant } from './usePopoverFlottant'
import { GrilleAnnees } from './GrilleAnnees'
import { anneeCouranteApp } from '@/lib/date-app'

/** Borne `n` dans [min, max] (pour recaler le focus initial sur la valeur). */
const borner = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * Sélecteur d'ANNÉE « Menthe & Encre » — pour les cas où seule l'année a un sens (ex. barème
 * annuel, année d'adhésion/fin de contribution d'un membre), sans la complexité jours/mois d'un
 * calendrier. Réutilise les primitives PARTAGÉES avec le DatePicker : `usePopoverFlottant` (portail
 * + `position: fixed` + clic extérieur + Échap) et `GrilleAnnees` (grille par décennie + navigation
 * + bornes + clavier).
 *
 * Contrat : `value` = année (nombre) ou `null` (« non défini »), `onChange(annee)` reçoit une année
 * TOUJOURS dans [min, max] (cellules hors bornes désactivées) — ou `null` uniquement en mode
 * `optionnel` (bouton « Effacer »). En `null`, le déclencheur affiche `placeholder` (défaut « — »),
 * cohérent avec un `<Select>` optionnel voisin. Compatible `<Field>` : reçoit `id`/`aria-invalid`/
 * `aria-describedby` et les porte sur le déclencheur.
 */

type SelecteurAnneeProps = {
  value: number | null
  onChange: (annee: number | null) => void
  /** Bornes incluses. Défauts alignés sur la validation barème (§5). */
  min?: number
  max?: number
  /** Autorise l'état « non défini » : affiche un bouton « Effacer » qui rappelle `onChange(null)`. */
  optionnel?: boolean
  /** Affiché quand `value` est `null` (défaut « — », comme l'option vide d'un Select). */
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Nom accessible du déclencheur quand le composant n'est PAS dans un `<Field>` (pas de label lié). */
  'aria-label'?: string
  // Injectés par <Field> (clonage) :
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}

export function SelecteurAnnee({
  value,
  onChange,
  min = 1900,
  max = 2200,
  optionnel = false,
  placeholder = '—',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SelecteurAnneeProps) {
  const { t } = useTranslation()
  const today = useMemo(() => anneeCouranteApp(), [])

  const [open, setOpen] = useState(false)
  // Focus roving : sur la valeur si définie, sinon sur l'année courante (bornée) comme point d'entrée.
  const [focusAnnee, setFocusAnnee] = useState<number>(() => borner(value ?? today, min, max))
  // Posé par les flèches ‹ / › de décennie (dans GrilleAnnees) pour que l'effet roving ne vole PAS
  // le focus vers une cellule (il doit rester sur le bouton de décennie).
  const conserverFocusRef = useRef(false)

  const { containerRef, triggerRef, popoverRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: () => setOpen(false),
    largeurDefaut: 240,
    hauteurDefaut: 220,
  })

  // À l'ouverture : recale le focus roving sur la valeur (bornée), ou l'année courante si non définie.
  useEffect(() => {
    if (open) setFocusAnnee(borner(value ?? today, min, max))
  }, [open, value, today, min, max])

  // Focus DOM sur la cellule active (roving), sans faire défiler la page (popover en portail).
  useEffect(() => {
    if (!open) return
    if (conserverFocusRef.current) {
      conserverFocusRef.current = false
      return
    }
    popoverRef.current
      ?.querySelector<HTMLButtonElement>(`[data-annee="${focusAnnee}"]`)
      ?.focus({ preventScroll: true })
  }, [open, focusAnnee, popoverRef])

  const fermerEtRendre = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [triggerRef])

  const choisir = useCallback(
    (annee: number) => {
      if (annee < min || annee > max) return
      onChange(annee)
      fermerEtRendre()
    },
    [min, max, onChange, fermerEtRendre],
  )

  // Mode optionnel uniquement : remet l'année à « non défini ».
  const effacer = useCallback(() => {
    onChange(null)
    fermerEtRendre()
  }, [onChange, fermerEtRendre])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (open) return
          // Parité avec l'ancien <input> natif : Entrée SOUMET le formulaire environnant (au lieu
          // d'ouvrir le popover) ; le picker s'ouvre via Espace, flèche bas/haut ou clic.
          if (e.key === 'Enter') {
            e.preventDefault()
            triggerRef.current?.form?.requestSubmit()
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(controlClasses, 'flex items-center justify-between gap-2 text-left')}
      >
        {value === null ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="num">{value}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open &&
        rendreFlottant(
          <>
            <GrilleAnnees
              focusAnnee={focusAnnee}
              setFocusAnnee={setFocusAnnee}
              min={min}
              max={max}
              valeurSelectionnee={value}
              anneeCourante={today}
              conserverFocusRef={conserverFocusRef}
              onChoisir={choisir}
              onEchap={fermerEtRendre}
              labelPrecedente={t('ui.selecteurAnnee.decenniePrecedente')}
              labelSuivante={t('ui.selecteurAnnee.decennieSuivante')}
              ariaLive
            />
            {optionnel && value !== null && (
              <button
                type="button"
                onClick={effacer}
                className="mt-2 w-full rounded-lg py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
              >
                {t('ui.selecteurAnnee.effacer')}
              </button>
            )}
          </>,
          {
            className: 'nk-toast-in z-50 w-[15rem] rounded-2xl border border-hairline bg-canvas p-3 shadow-xl',
            'aria-label': t('ui.selecteurAnnee.dialogue'),
          },
        )}
    </div>
  )
}

export default SelecteurAnnee
