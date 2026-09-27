import { prefersReducedMotion } from '@/lib/utils'

/**
 * Outillage PARTAGÉ des phases de sortie (`Modal`, `usePopoverFlottant`) — deux besoins que ni
 * l'un ni l'autre ne pouvait résoudre seul sans le recopier.
 */

/**
 * Durée d'un fondu sous `prefers-reduced-motion`.
 *
 * Elle n'est pas nulle, et c'est le point. La règle demande de supprimer le MOUVEMENT, pas toute
 * transition : un fondu d'opacité ne déclenche pas de gêne vestibulaire, alors qu'une apparition
 * sèche reste brutale — pour ce public plus que pour un autre. On garde donc un fondu court, sans
 * aucun déplacement ni changement d'échelle (cf. le bloc `prefers-reduced-motion` d'`index.css`).
 */
export const DUREE_FONDU_REDUIT_MS = 120

/** Durée effective d'une sortie : le fondu court si le mouvement est réduit, sinon la durée native. */
export function dureeSortie(dureeNative: number): number {
  return prefersReducedMotion() ? DUREE_FONDU_REDUIT_MS : dureeNative
}

/**
 * REPRISE D'UNE SORTIE INTERROMPUE — rouvrir pendant qu'un panneau se ferme.
 *
 * Une `@keyframes` ne se retargete pas : elle REPART DE ZÉRO. Une modale interrompue à mi-sortie
 * (opacité ~0,4, échelle ~0,985) rejouait donc son entrée depuis 0,97/opacité 0 — un saut en
 * arrière, visible, là où l'œil attend une reprise.
 *
 * `commitStyles()` écrit l'état COURANT de l'animation en styles en ligne ; on annule ensuite
 * l'animation. L'élément reste exactement là où il en était, et la transition CSS de reprise
 * (`.nk-reprise`) le ramène à son état de repos DEPUIS ce point. C'est ce que fait une transition
 * nativement et qu'une keyframe ne sait pas faire.
 *
 * Pourquoi ne pas avoir tout converti en transitions : l'entrée aurait alors exigé
 * `@starting-style` (ou un double rendu), qui dégrade en « aucune animation » sur les navigateurs
 * qui ne l'ont pas. Ici on garde les keyframes — lisibles, sans piège de montage — et on ne paie
 * la mécanique que sur le cas d'interruption, qui est rare.
 *
 * Sans effet si l'élément n'anime pas (rien à reprendre), et tolérant aux navigateurs sans
 * `commitStyles` : on retombe alors sur l'ancien comportement plutôt que de lever.
 */
export function reprendreDepuisEtatCourant(element: HTMLElement | null): void {
  // `getAnimations` manque à jsdom et aux navigateurs anciens : sans cette garde, la reprise
  // LÈVE et emporte le rendu du composant. Le repli est l'ancien comportement (l'entrée rejoue
  // depuis son début), qui est dégradé, pas cassé.
  if (!element || typeof element.getAnimations !== 'function') return
  for (const animation of element.getAnimations()) {
    try {
      animation.commitStyles()
    } catch {
      // `commitStyles` lève si l'élément n'est pas rendu, ou n'existe pas (navigateur ancien).
      // Dans les deux cas il n'y a rien à reprendre : on annule et on laisse le rendu par défaut.
    }
    animation.cancel()
  }
}

/** Efface les styles posés par `reprendreDepuisEtatCourant` une fois la reprise terminée. */
export function effacerEtatRepris(element: HTMLElement | null): void {
  if (!element) return
  element.style.removeProperty('opacity')
  element.style.removeProperty('transform')
}
