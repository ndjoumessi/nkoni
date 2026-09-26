import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn, prefersReducedMotion } from '@/lib/utils'

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
 *    traité l'évènement — `e.defaultPrevented` —, ce qui préserve les Échap contextuels des grilles) ;
 *  - le MONTAGE lui-même, entrée ET sortie comprises (`nk-popover-in` / `nk-popover-out`).
 *
 * C'est le hook qui décide de monter, PAS l'appelant : `rendreFlottant` rend `null` quand il n'y a
 * rien à afficher. Un appelant qui écrirait `{open && rendreFlottant(…)}` lui retirerait toute
 * possibilité d'animer une sortie, puisqu'il déciderait du démontage (même contrainte que `Modal`).
 *
 * Pendant la sortie, la bulle est INERTE — attribut `inert` — et ses `coords` sont GELÉES : elle
 * rétrécit vers son déclencheur au lieu de suivre un scroll qu'elle ne commente plus.
 *
 * Le comportement (mesures, marges, bascule) est identique à l'implémentation d'origine des deux
 * composants ; seules les dimensions de repli avant première mesure sont paramétrables.
 */
/**
 * ORIGINE DE TRANSFORMATION d'un popover — la bulle doit grandir DEPUIS son déclencheur, et non
 * depuis son centre. C'est ce qui la relie visuellement au bouton qu'on vient de cliquer ; pris
 * isolément personne ne le remarque, mais c'est l'accumulation de ces riens qui fait qu'une
 * interface paraît juste.
 *
 * Fonction PURE et exportée pour être testable : les deux bornes ci-dessous ne se devinent pas.
 *
 * @param centreDeclencheur abscisse du centre du déclencheur, en coordonnées de fenêtre
 * @param gauchePopover     abscisse du bord gauche de la bulle (déjà bornée au viewport)
 * @param largeurPopover    largeur de la bulle
 * @param versLeHaut        la bulle a basculé AU-DESSUS du déclencheur faute de place en dessous
 */
/** Doit valoir la durée de `.nk-popover-out` (index.css). */
const DUREE_SORTIE_MS = 110

export function origineDepuisDeclencheur(
  centreDeclencheur: number,
  gauchePopover: number,
  largeurPopover: number,
  versLeHaut: boolean,
): string {
  // Horizontalement : le centre du déclencheur ramené DANS la bulle. Le bornage n'est pas de la
  // prudence — la bulle a pu être décalée pour tenir dans la fenêtre, et un déclencheur près d'un
  // bord tombe alors hors d'elle ; sans ce clamp, l'origine sortirait de l'élément et la bulle
  // grandirait depuis un point situé à côté d'elle.
  const x = Math.min(Math.max(centreDeclencheur - gauchePopover, 0), largeurPopover)
  // Verticalement : le bord par lequel la bulle TOUCHE le déclencheur. Inversé quand elle a
  // basculé au-dessus, sinon elle grandirait en s'éloignant de lui.
  return `${Math.round(x)}px ${versLeHaut ? 'bottom' : 'top'}`
}

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
  const [coords, setCoords] = useState<{ top: number; left: number; origine: string } | null>(
    null,
  )

  // Phase de sortie : vrai entre la fermeture demandée et le démontage effectif. Même motif que
  // `Modal` — ajustement pendant le rendu, pour qu'aucune image ne passe « bulle déjà disparue ».
  const [sortant, setSortant] = useState(false)
  const [ouvertPrecedent, setOuvertPrecedent] = useState(open)
  if (open !== ouvertPrecedent) {
    setOuvertPrecedent(open)
    setSortant(!open)
  }
  const monte = open || sortant

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
    let versLeHaut = false
    if (r.bottom + gap + hauteur > vh && r.top > vh - r.bottom) {
      top = Math.max(gap, r.top - gap - hauteur)
      versLeHaut = true
    }
    const left = Math.max(gap, Math.min(r.left, vw - largeur - gap))

    setCoords({
      top,
      left,
      origine: origineDepuisDeclencheur(r.left + r.width / 2, left, largeur, versLeHaut),
    })
  }, [largeurDefaut, hauteurDefaut])

  // (Re)positionne à l'ouverture, au changement de vue (`repositionSur` : la hauteur peut varier),
  // puis au scroll (capture → n'importe quel conteneur défilant) et au resize.
  useLayoutEffect(() => {
    if (!monte) {
      setCoords(null)
      return
    }
    // Pendant la sortie : coords GELÉES, aucun écouteur. La bulle part de là où elle était.
    if (!open) return
    positionner()
    const surMaj = () => positionner()
    window.addEventListener('scroll', surMaj, true)
    window.addEventListener('resize', surMaj)
    return () => {
      window.removeEventListener('scroll', surMaj, true)
      window.removeEventListener('resize', surMaj)
    }
  }, [open, monte, repositionSur, positionner])

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

  // Fin de la sortie → démontage. Sous `prefers-reduced-motion` la feuille de style a déjà
  // neutralisé l'animation : patienter ne ferait que laisser une bulle invisible dans le DOM.
  useEffect(() => {
    if (!sortant) return
    const handle = window.setTimeout(
      () => setSortant(false),
      prefersReducedMotion() ? 0 : DUREE_SORTIE_MS,
    )
    return () => window.clearTimeout(handle)
  }, [sortant])

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

  /**
   * Rend le contenu dans le portail positionné, ou `null` s'il n'y a rien à afficher — c'est le
   * hook qui décide du montage (cf. docblock). `className`/`aria-label` propres à chaque popover.
   */
  const rendreFlottant = (
    enfants: ReactNode,
    { className, 'aria-label': ariaLabel }: { className: string; 'aria-label': string },
  ) => {
    if (!monte) return null
    return createPortal(
      <div
        ref={popoverRef}
        onKeyDown={onKeyDownPopover}
        // Ce qui part devient INERTE : `inert` retire le sous-arbre de l'ordre de tabulation,
        // bloque les évènements de pointeur et le masque aux technologies d'assistance.
        //
        // Les trois à la fois, et c'est nécessaire : `aria-hidden` + `pointer-events-none` seuls
        // laissaient, mesuré en production sur le calendrier, 46 boutons de jour encore
        // focusables dans un conteneur annoncé absent — la souris bloquée, le clavier non, soit
        // la règle `aria-hidden-focus` violée. `aria-hidden` reste à côté en ceinture et
        // bretelles, et ne viole plus rien puisque plus rien n'y est focusable.
        {...(sortant
          ? { inert: true, 'aria-hidden': true }
          : { role: 'dialog', 'aria-modal': 'false' as const, 'aria-label': ariaLabel })}
        style={{
          position: 'fixed',
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          // Masqué tant que la position n'est pas calculée (évite un flash en haut à gauche).
          visibility: coords ? 'visible' : 'hidden',
          // Conservée pendant la sortie : la bulle rétrécit VERS son déclencheur, exactement le
          // chemin de son entrée à l'envers.
          transformOrigin: coords?.origine,
        }}
        // L'animation n'est posée QU'UNE FOIS la position connue : appliquée pendant la phase
        // masquée, elle se jouerait dans le vide et la bulle apparaîtrait déjà stabilisée.
        className={cn(
          className,
          coords && (sortant ? 'nk-popover-out pointer-events-none' : 'nk-popover-in'),
        )}
      >
        {enfants}
      </div>,
      document.body,
    )
  }

  // `positionne` : la bulle est positionnée donc VISIBLE (cf. `visibility` ci-dessus). Un navigateur
  // ignore un `focus()` sur un élément masqué : qui veut focaliser le contenu à l'ouverture doit
  // attendre ce drapeau (ajout pour AideNotion, les autres popovers l'ignorent).
  // `positionne` ne vaut que pour une bulle OUVERTE : pendant la sortie, personne ne doit y
  // renvoyer le focus (AideNotion focalise son contenu sur ce drapeau).
  return { containerRef, triggerRef, popoverRef, rendreFlottant, positionne: open && coords !== null }
}
