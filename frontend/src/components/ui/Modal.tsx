import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn, prefersReducedMotion } from '@/lib/utils'

/**
 * Sélecteur des éléments focusables au clavier À L'INTÉRIEUR du panneau — utilisé par le
 * piège de focus (§1/§8). Le `[tabindex="-1"]` du panneau lui-même est volontairement exclu.
 */
const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Doit valoir la durée de `.nk-modale-out` / `.nk-voile-out` (index.css) : au-delà, le panneau
 *  resterait monté, invisible et immobile, en retenant le verrou de défilement du body. */
const DUREE_SORTIE_MS = 140

/**
 * Modale légère centrée — direction « Laiton & Jade » : overlay flouté + Card.
 * Ferme sur Escape et sur clic backdrop. Verrouille le scroll du body à l'ouverture.
 *
 * Accessibilité (§1/§8) — piège de focus complet :
 * - à l'OUVERTURE : l'élément déclencheur (`document.activeElement`) est mémorisé, puis le
 *   focus est déplacé sur le panneau (rendu focusable via `tabIndex={-1}`) ;
 * - PENDANT : Tab / Shift+Tab bouclent à l'intérieur du panneau (dernier → premier et
 *   inversement) ; Échap et le clic backdrop restent inchangés ;
 * - à la FERMETURE : le focus est restauré sur le déclencheur mémorisé s'il existe encore —
 *   IMMÉDIATEMENT, sans attendre la fin de l'animation de sortie (cf. ci-dessous). Un
 *   utilisateur au clavier ne doit jamais patienter derrière une décoration.
 *
 * SORTIE ANIMÉE — le panneau reste monté `DUREE_SORTIE_MS` après le passage de `open` à faux,
 * le temps de jouer `nk-modale-out` / `nk-voile-out`. Trois conséquences, toutes traitées ici :
 *  1. le CONTENU est FIGÉ pendant la sortie (cf. `contenuFige`) ;
 *  2. la modale devient INERTE — attribut `inert`, plus aucun raccourci clavier : ce qui part ne
 *     doit plus ni répondre, ni être annoncé, ni être cliquable, ni être ATTEIGNABLE AU CLAVIER ;
 *  3. le verrou de défilement du body ne se relâche qu'au DÉMONTAGE, sinon la page bougerait
 *     derrière un panneau encore visible.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const panneauRef = useRef<HTMLDivElement>(null)
  const declencheurRef = useRef<HTMLElement | null>(null)

  // Phase de sortie : vrai entre la fermeture demandée et le démontage effectif.
  const [sortant, setSortant] = useState(false)
  const [ouvertPrecedent, setOuvertPrecedent] = useState(open)

  /**
   * DERNIER CONTENU AFFICHÉ, conservé pour la durée de la sortie.
   *
   * Sans lui, l'animation de sortie trahirait ce qu'elle est censée adoucir. Presque tous les
   * appelants pilotent la modale par la donnée qu'elle affiche (`open={cible !== null}`) et
   * remettent cette donnée à zéro dans `onClose` : pendant les 140 ms de sortie, le panneau
   * afficherait donc un contenu VIDÉ — un nom qui s'efface, un montant qui devient « — » —,
   * quand il ne planterait pas sur un `cible.montant` devenu nul. On rejoue donc la dernière
   * image connue plutôt que l'état courant.
   *
   * Le TITRE est figé avec le contenu, et pour la même raison : il se dérive souvent du même
   * état (« Modifier une dépense » / « Nouvelle dépense »), et basculerait donc à la fermeture.
   *
   * Mémorisé dans un effet et non pendant le rendu : au rendu de fermeture, `children` porte
   * DÉJÀ le contenu vidé. Seul ce qui a été commité juste avant fait foi.
   */
  const figeRef = useRef<{ titre: string; enfants: ReactNode }>({ titre: title, enfants: null })

  // Ajustement d'état pendant le rendu (motif React « état dérivé d'un changement de prop ») :
  // le rendu en cours est abandonné et relancé avant tout affichage. Le faire dans un effet
  // laisserait passer une image où la modale a déjà disparu — soit précisément le saut qu'on
  // cherche à supprimer.
  if (open !== ouvertPrecedent) {
    setOuvertPrecedent(open)
    // Réouverture pendant une sortie : on annule la sortie et l'entrée reprend la main.
    setSortant(!open)
  }

  useEffect(() => {
    if (open) figeRef.current = { titre: title, enfants: children }
  })

  // Focus : entrée dans la modale à l'ouverture, restauration au déclencheur à la fermeture.
  // Dépendance [open] UNIQUEMENT : un `onClose` recréé à chaque render ne doit pas re-mémoriser
  // un activeElement devenu interne à la modale. Le nettoyage s'exécute quand `open` retombe,
  // donc AU DÉBUT de la sortie : le focus revient sans attendre l'animation.
  useEffect(() => {
    if (!open) return
    declencheurRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panneauRef.current?.focus()
    return () => {
      const declencheur = declencheurRef.current
      if (declencheur && declencheur.isConnected) declencheur.focus()
    }
  }, [open])

  // Raccourcis clavier — actifs seulement tant que la modale est OUVERTE. Pendant la sortie,
  // Échap et Tab ne doivent plus rien déclencher : la modale n'est plus une cible, elle part.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Piège de focus : Tab / Shift+Tab bouclent dans le panneau (§8 focus-management).
      if (e.key !== 'Tab') return
      const panneau = panneauRef.current
      if (!panneau) return
      const focusables = Array.from(panneau.querySelectorAll<HTMLElement>(FOCUSABLES))
      if (focusables.length === 0) {
        e.preventDefault()
        panneau.focus()
        return
      }
      const premier = focusables[0]
      const dernier = focusables[focusables.length - 1]
      const actif = document.activeElement
      const dansPanneau = actif instanceof HTMLElement && panneau.contains(actif)
      if (e.shiftKey) {
        // Shift+Tab depuis le premier focusable (ou depuis le panneau lui-même) → dernier.
        if (!dansPanneau || actif === premier || actif === panneau) {
          e.preventDefault()
          dernier.focus()
        }
      } else if (!dansPanneau || actif === dernier) {
        // Tab depuis le dernier focusable → premier.
        e.preventDefault()
        premier.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const monte = open || sortant

  // Verrou de défilement tenu sur TOUTE la durée d'affichage, sortie comprise.
  useEffect(() => {
    if (!monte) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [monte])

  // Fin de la sortie → démontage. Sous `prefers-reduced-motion`, l'animation est neutralisée par
  // la feuille de style : attendre 140 ms ne ferait que retenir le verrou de défilement devant un
  // panneau déjà invisible, on démonte donc au tour de boucle suivant.
  useEffect(() => {
    if (!sortant) return
    const handle = window.setTimeout(
      () => setSortant(false),
      prefersReducedMotion() ? 0 : DUREE_SORTIE_MS,
    )
    return () => window.clearTimeout(handle)
  }, [sortant])

  if (!monte) return null

  // Pendant la sortie, on rejoue la dernière image connue (cf. `figeRef`) ; à l'ouverture, l'état
  // courant fait foi.
  const titreAffiche = open ? title : figeRef.current.titre
  const enfantsAffiches = open ? children : figeRef.current.enfants

  // Rendu en PORTAIL dans <body> : un ancêtre animé `nk-reveal` laisse un `transform` résiduel
  // qui deviendrait le containing block des `position: fixed` → la modale se positionnerait par
  // rapport à lui et serait écrêtée (même piège que les popovers, cf. CLAUDE.md). Le portail
  // l'immunise structurellement.
  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4',
        // Ce qui part n'est plus cliquable : sans cela, un clic pressé pendant la sortie
        // atteindrait un bouton FIGÉ, donc une action qui n'est plus celle affichée.
        sortant && 'pointer-events-none',
      )}
      // Pendant la sortie, la modale devient INERTE. `inert` fait les trois choses à la fois :
      // il retire le sous-arbre de l'ordre de tabulation, bloque les évènements de pointeur et
      // le masque aux technologies d'assistance.
      //
      // Le premier point est ce qui a manqué : une première version posait `aria-hidden` et
      // `pointer-events-none`, plus `disabled` sur le voile et la croix. Mesuré en production,
      // il restait 7 éléments focusables (les champs et les boutons du formulaire, qui vivent
      // dans le contenu FIGÉ et qu'on ne peut donc pas désarmer un par un) à l'intérieur d'un
      // conteneur annoncé absent — soit exactement ce qu'interdit la règle `aria-hidden-focus` :
      // la souris était bloquée, le clavier non. `aria-hidden` reste posé à côté, en ceinture et
      // bretelles, et ne viole plus rien puisque plus rien n'y est focusable.
      {...(sortant
        ? { inert: true, 'aria-hidden': true }
        : { role: 'dialog', 'aria-modal': true, 'aria-label': titreAffiche })}
    >
      <button
        type="button"
        aria-label={t('ui.modal.fermer')}
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm',
          sortant ? 'nk-voile-out' : 'nk-voile-in',
        )}
      />
      {/* HAUTEUR BORNÉE + CORPS DÉFILANT — obligatoire, pas cosmétique. Le panneau était centré
          SANS `max-h` ni `overflow`, alors que `document.body` est verrouillé (`overflow:hidden`,
          cf. plus haut) : tout contenu plus haut que la fenêtre était coupé EN HAUT ET EN BAS, et
          les boutons de validation devenaient inatteignables (formulaire dépense/amende, cropper
          photo, détail d'organisation… à 360 px). `dvh` et non `vh` : suit la barre d'URL
          rétractable d'Android. `overscroll-contain` empêche le scroll de « traverser » vers le
          body verrouillé. Le découpage en-tête/corps reproduit EXACTEMENT l'ancien espacement
          (p-6 + mb-4 sous le titre) → aucun changement visuel. */}
      <div
        ref={panneauRef}
        tabIndex={-1}
        className={cn(
          // `nk-modale-in` et NON `nk-toast-in` : une modale n'est ancrée à rien, elle ne doit
          // pas glisser du haut comme une notification qui arriverait d'ailleurs. Elle grandit sur
          // place depuis son centre, et le voile fond en même temps qu'elle (`nk-voile-in`).
          // La sortie est le miroir du même geste, en plus court.
          sortant ? 'nk-modale-out' : 'nk-modale-in',
          'relative flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas shadow-xl',
          className,
        )}
      >
        {/* Gouttières RESSERRÉES sous `sm:` — 24 px de padding de chaque côté sur un écran de
            360 px consommaient 13 % de la largeur utile, ce qui écrasait les contenus larges
            (recadrage photo, formulaires à deux colonnes). Inchangé à partir de `sm:`. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <h2 className="font-display text-lg font-semibold text-foreground">{titreAffiche}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.modal.fermer')}
            className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-6 sm:pb-6">
          {enfantsAffiches}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default Modal
