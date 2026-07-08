import { useCallback, useMemo, type RefObject } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navButtonClasses } from './control-styles'

/** Borne `n` dans [min, max] (min/max peuvent valoir ±Infinity = pas de borne). */
const bornerAnnee = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * Grille d'ANNÉES par décennie — primitive PARTAGÉE par le panneau « années » du DatePicker et par
 * SelecteurAnnee (finding #5 de la revue : ~70 lignes dupliquées). CONTRÔLÉE : le parent détient
 * `focusAnnee` (source de vérité), l'effet de focus roving (DOM) et `conserverFocusRef` ; cette
 * grille ne fait que l'AFFICHAGE, la navigation décennie ‹ / › et la gestion clavier.
 *
 * Comportements préservés à l'identique : décennie + 1 an de débordement (12 cellules), cellules
 * hors [min, max] DÉSACTIVÉES (finding #3), sélection/aujourd'hui surlignés, focus roving via
 * `data-annee` (posé par le parent), Home/End/PageUp-Down + flèches, Entrée/Espace → `onChoisir`,
 * Échap → `onEchap` (contextuel : le DatePicker remonte d'un niveau, SelecteurAnnee ferme).
 */
export function GrilleAnnees({
  focusAnnee,
  setFocusAnnee,
  min,
  max,
  valeurSelectionnee,
  anneeCourante,
  conserverFocusRef,
  onChoisir,
  onEchap,
  labelPrecedente,
  labelSuivante,
  ariaLive = false,
}: {
  focusAnnee: number
  setFocusAnnee: (updater: (annee: number) => number) => void
  min: number
  max: number
  valeurSelectionnee: number | null
  anneeCourante: number
  conserverFocusRef: RefObject<boolean>
  onChoisir: (annee: number) => void
  onEchap: () => void
  labelPrecedente: string
  labelSuivante: string
  /** Porte `aria-live` sur la plage de décennie (SelecteurAnnee ; le DatePicker annonce via sr-only). */
  ariaLive?: boolean
}) {
  const decennieBase = Math.floor(focusAnnee / 10) * 10
  const anneesGrille = useMemo(
    () => Array.from({ length: 12 }, (_, i) => decennieBase - 1 + i),
    [decennieBase],
  )
  const horsBornes = useCallback((annee: number) => annee < min || annee > max, [min, max])

  // Décennie ‹ / › : déplace la grille de 10 ans en gardant le focus sur le bouton (le parent voit
  // `conserverFocusRef` et n'exécute pas son roving → pas de vol vers une cellule).
  const changerDecennie = useCallback(
    (delta: number) => {
      conserverFocusRef.current = true
      setFocusAnnee((y) => bornerAnnee(y + delta * 10, min, max))
    },
    [conserverFocusRef, setFocusAnnee, min, max],
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
          onChoisir(focusAnnee)
          return
        case 'Escape':
          e.preventDefault()
          onEchap()
          return
        default:
          return
      }
      e.preventDefault()
      setFocusAnnee(() => bornerAnnee(n, min, max))
    },
    [focusAnnee, min, max, onChoisir, onEchap, setFocusAnnee],
  )

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label={labelPrecedente} onClick={() => changerDecennie(-1)} className={navButtonClasses}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          className="font-display text-sm font-semibold text-foreground"
          {...(ariaLive ? { 'aria-live': 'polite' as const } : {})}
        >
          {decennieBase} – {decennieBase + 9}
        </span>
        <button type="button" aria-label={labelSuivante} onClick={() => changerDecennie(1)} className={navButtonClasses}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div role="grid" onKeyDown={onKeyDown} className="grid grid-cols-4 gap-1 py-1">
        {anneesGrille.map((annee) => {
          const dansDecennie = annee >= decennieBase && annee <= decennieBase + 9
          const estSel = annee === valeurSelectionnee
          const estCourante = annee === anneeCourante
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
              onClick={() => onChoisir(annee)}
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
    </>
  )
}

export default GrilleAnnees
