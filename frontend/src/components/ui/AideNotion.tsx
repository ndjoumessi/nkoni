import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleHelp, ExternalLink } from 'lucide-react'
import { LIENS_AIDE, type NotionAide } from '@/lib/aide'
import { cleI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usePopoverFlottant } from './usePopoverFlottant'

/**
 * Aide contextuelle (spec 2026-09-17) : un « ? » à côté d'une notion métier, qui ouvre une courte
 * explication tirée du catalogue (`lib/aide.ts` + namespace i18n `aide`). Primitive PARTAGÉE — ne pas
 * recréer d'infobulle ad hoc.
 *
 * - Ouverture au clic et au clavier, JAMAIS au survol (absent sur mobile, gênant au lecteur d'écran).
 * - Bulle en PORTAIL via `usePopoverFlottant` (immunité aux contextes d'empilement `nk-reveal`).
 * - **Focus déplacé DANS la bulle à l'ouverture** (WCAG 2.1.1/2.4.3) : la bulle vit hors du flux DOM
 *   du déclencheur (portail), donc sans ce déplacement, Tab depuis le « ? » saute la bulle vers le
 *   prochain contrôle de PAGE (ex. le champ du `Field` voisin) — le lien « En savoir plus » devient
 *   inatteignable au clavier. Le conteneur de contenu est rendu focalisable (`tabIndex={-1}`) ; le
 *   `aria-label` du dialog (posé par `usePopoverFlottant`) porte le titre, lu par le lecteur d'écran.
 * - Échap referme et rend le focus au « ? » ; clic extérieur et second clic referment.
 * - **Sortie de focus (Tab hors bulle ET hors déclencheur) referme SANS reprendre le focus** :
 *   contrairement à Échap, l'utilisateur est parti ailleurs délibérément — lui voler le focus le
 *   ramènerait de force en arrière.
 * - **Échap coupe la PROPAGATION NATIVE** (`nativeEvent.stopPropagation()`) : `stopPropagation()` de
 *   React ne coupe que la diffusion SYNTHÉTIQUE ; un ancêtre qui écoute `keydown` sur `window` en DEHORS
 *   de React (ex. `Modal.tsx`) recevrait quand même l'évènement natif et se refermerait en même temps.
 * - Placement : à côté d'un libellé, jamais DANS un `<label>` ou un titre (`Field`/`PageHeader` ont une
 *   prop `aide`), jamais dans une ligne de tableau ; au plus un « ? » par notion dans un écran.
 * - **PAS de `.tap-target` ici, bouton porté à 24 px** : l'utilitaire projette une hitbox INVISIBLE de
 *   44 px centrée, et `index.css` le réserve aux boutons ISOLÉS. Sous un libellé de `Field`, le « ? »
 *   n'est pas isolé — 12 px débordaient sous lui pour seulement 6 px de `mb-1.5`, si bien qu'un appui
 *   sur le haut du champ ouvrait l'aide au lieu de mettre le focus dans le champ (et à gauche, la
 *   hitbox mangeait la fin du `<label>`, dont le clic focalise le contrôle). On agrandit donc le
 *   bouton LUI-MÊME (précédent `MonEspacePage`) : 24 × 24 px réels, sans recouvrir quoi que ce soit.
 *   C'est le minimum WCAG 2.2 AA (2.5.8) plutôt que l'AAA 2.5.5 — arbitrage assumé pour un contrôle
 *   secondaire et non destructif, voler l'appui d'un champ de saisie étant le pire des deux maux.
 * - **« En savoir plus » ouvre la section de la documentation publique dans un NOUVEL ONGLET**
 *   (`<a target="_blank">`, pas un `<Link>`) : une navigation dans l'onglet ferait perdre la saisie
 *   d'un formulaire voisin. L'annonce « nouvel onglet » est portée par un texte `sr-only`.
 * - **Notion placée dans un `Modal` ⇒ PAS d'entrée `LIENS_AIDE`** : le piège à focus du `Modal`
 *   ramène le focus au premier contrôle du panneau dès qu'il sort vers le portail de la bulle, ce qui
 *   ferme la bulle — le lien « En savoir plus » y serait inatteignable.
 */
export function AideNotion({ notion, className }: { notion: NotionAide; className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const idTexte = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const fermer = useCallback(() => setOpen(false), [])
  const { containerRef, triggerRef, popoverRef, rendreFlottant, positionne } = usePopoverFlottant({
    open,
    onFermer: fermer,
    largeurDefaut: 288,
    hauteurDefaut: 160,
  })

  const titre = t(cleI18n(`aide.notions.${notion}.titre`))
  const lien = LIENS_AIDE[notion]

  const fermerEtRefocaliser = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [triggerRef])

  // Entrée de focus : dès que la bulle est ouverte ET positionnée, son conteneur de contenu reçoit le
  // focus. Attendre `positionne` est OBLIGATOIRE : le portail reste `visibility:hidden` tant que la
  // primitive n'a pas posé ses coordonnées, et son `setCoords` (useLayoutEffect) programme un
  // re-rendu que React ne fait qu'APRÈS les effets passifs de la validation courante — un focus()
  // déclenché sur `open` seul tomberait sur un élément encore masqué, ignoré par les navigateurs
  // (jsdom, lui, l'accepte : d'où le test qui simule ce refus).
  useEffect(() => {
    if (open && positionne) contentRef.current?.focus()
  }, [open, positionne])

  // Sortie de focus hors bulle ET hors déclencheur : referme, sans voler le focus. `focusout`
  // (contrairement à `blur`) REMONTE, donc un seul écouteur au niveau document suffit à couvrir le
  // conteneur ET la bulle en portail (deux sous-arbres DOM distincts).
  // `relatedTarget` NULL (focus parti « nulle part ») est IGNORÉ : Safari/iOS ne focalise pas un
  // <button> cliqué, donc un clic sur le « ? » produirait ce focusout AVANT le click qui bascule —
  // la bulle se fermerait puis se rouvrirait. Les clics extérieurs sont déjà couverts par le
  // mousedown de `usePopoverFlottant`.
  useEffect(() => {
    if (!open) return
    const surSortieFocus = (e: FocusEvent) => {
      const suivant = e.relatedTarget as Node | null
      if (!suivant) return
      if (containerRef.current?.contains(suivant) || popoverRef.current?.contains(suivant)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('focusout', surSortieFocus)
    return () => document.removeEventListener('focusout', surSortieFocus)
  }, [open, containerRef, popoverRef])

  const onEchap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      // cf. docblock : coupe la remontée NATIVE (pas seulement synthétique) vers un `window`
      // à l'écoute (Modal), sans quoi Échap fermerait la bulle ET la modale parente d'un coup.
      e.nativeEvent.stopPropagation()
      fermerEtRefocaliser()
    },
    [fermerEtRefocaliser],
  )

  return (
    <span ref={containerRef} className={cn('relative inline-flex align-middle', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (open) onEchap(e)
        }}
        aria-label={t('aide.libelleBouton', { titre })}
        aria-expanded={open}
        aria-controls={open ? idTexte : undefined}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:text-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {rendreFlottant(
          <div
            ref={contentRef}
            id={idTexte}
            tabIndex={-1}
            onKeyDown={onEchap}
            className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-hairline-strong bg-surface p-4 text-left normal-case tracking-normal shadow-2xl focus:outline-none"
          >
            <p className="text-sm font-semibold text-foreground">{titre}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(cleI18n(`aide.notions.${notion}.texte`))}
            </p>
            {lien && (
              // Nouvel onglet, pas une navigation : le « ? » vit souvent à côté d'un champ de
              // formulaire, et quitter la page ferait perdre la saisie (cf. `LIENS_AIDE`).
              <a
                href={lien}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brass underline-offset-4 hover:underline"
              >
                {t('aide.enSavoirPlus')}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{t('aide.nouvelOnglet')}</span>
              </a>
            )}
          </div>,
          { className: 'z-50', 'aria-label': titre },
        )}
    </span>
  )
}
