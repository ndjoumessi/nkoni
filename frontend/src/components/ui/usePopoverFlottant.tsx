import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Infrastructure PARTAGÉE des popovers flottants (DatePicker, SelecteurAnnee) — extraite pour ne
 * pas dupliquer ~80 lignes identiques (finding #5 de la revue). Encapsule :
 *  - le rendu en PORTAIL dans `<body>` (`createPortal`) → immunité aux contextes d'empilement
 *    (nk-reveal `forwards`, transform, z-index d'un bloc frère) qui recouvriraient un `absolute` ;
 *  - le positionnement `position: fixed` calculé depuis le rect du déclencheur, avec bascule
 *    VERTICALE (au-dessus si pas la place en bas) et bornage HORIZONTAL au viewport ;
 *  - le recalcul au scroll (capture) / resize / changement de vue (`repositionSur`) ;
 *  - la fermeture au clic extérieur (le portail est épargné explicitement) ;
 *  - Échap pour fermer (au niveau du popover, ne se déclenche PAS si un handler interne a déjà
 *    traité l'évènement — `e.defaultPrevented` —, ce qui préserve les Échap contextuels des grilles).
 *
 * Le comportement (mesures, marges, bascule) est identique à l'implémentation d'origine des deux
 * composants ; seules les dimensions de repli avant première mesure sont paramétrables.
 */
export function usePopoverFlottant({
  open,
  onFermer,
  largeurDefaut = 300,
  hauteurDefaut = 340,
  repositionSur,
}: {
  open: boolean
  /** Fermeture « simple » (sans refocus) : clic extérieur + Échap posé hors d'une grille. */
  onFermer: () => void
  largeurDefaut?: number
  hauteurDefaut?: number
  /** Valeur dont le changement doit reprovoquer un repositionnement (ex. la vue active). */
  repositionSur?: unknown
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // Ancre le popover sous le déclencheur (ou au-dessus s'il n'y a pas la place), borné au viewport.
  const positionner = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const gap = 8
    const largeur = popoverRef.current?.offsetWidth ?? largeurDefaut
    const hauteur = popoverRef.current?.offsetHeight ?? hauteurDefaut
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight

    let top = r.bottom + gap
    if (r.bottom + gap + hauteur > vh && r.top > vh - r.bottom) {
      top = Math.max(gap, r.top - gap - hauteur)
    }
    const left = Math.max(gap, Math.min(r.left, vw - largeur - gap))
    setCoords({ top, left })
  }, [largeurDefaut, hauteurDefaut])

  // (Re)positionne à l'ouverture, au changement de vue (`repositionSur` : la hauteur peut varier),
  // puis au scroll (capture → n'importe quel conteneur défilant) et au resize.
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
  }, [open, repositionSur, positionner])

  // Fermeture au clic extérieur. Le popover vivant dans un PORTAIL (hors de containerRef), on
  // l'épargne explicitement : sinon un mousedown sur une cellule fermerait AVANT le click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const cible = e.target as Node
      if (containerRef.current?.contains(cible) || popoverRef.current?.contains(cible)) return
      onFermer()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onFermer])

  // Échap au niveau du popover : ne ferme QUE si aucun handler interne n'a déjà traité la touche
  // (les grilles font `preventDefault` pour leurs Échap contextuels → on ne double-ferme pas).
  const onKeyDownPopover = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onFermer()
      }
    },
    [onFermer],
  )

  /** Rend le contenu dans le portail positionné. `className`/`aria-label` propres à chaque popover. */
  const rendreFlottant = (
    enfants: ReactNode,
    { className, 'aria-label': ariaLabel }: { className: string; 'aria-label': string },
  ) =>
    createPortal(
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        onKeyDown={onKeyDownPopover}
        style={{
          position: 'fixed',
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          // Masqué tant que la position n'est pas calculée (évite un flash en haut à gauche).
          visibility: coords ? 'visible' : 'hidden',
        }}
        className={className}
      >
        {enfants}
      </div>,
      document.body,
    )

  return { containerRef, triggerRef, popoverRef, rendreFlottant }
}
