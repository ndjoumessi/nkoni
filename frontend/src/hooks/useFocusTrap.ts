import { useEffect, type RefObject } from 'react'

/**
 * Sélecteur des éléments focusables au clavier À L'INTÉRIEUR d'un overlay (identique à `Modal`).
 */
const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Piège de focus + verrou de scroll pour un overlay `aria-modal` (§1/§8) — utilisé par la
 * CommandPalette (⌘K) et le drawer mobile, qui n'avaient NI l'un NI l'autre. Reprend la logique
 * éprouvée de `ui/Modal.tsx` SANS refactorer cette dernière (aucune régression sur les modales) :
 *
 * - à l'ACTIVATION : mémorise le déclencheur (`document.activeElement`) et verrouille le scroll du
 *   body. Ne FORCE PAS le focus initial → le composant garde la main (la palette focalise son input,
 *   le drawer son bouton fermer) ;
 * - PENDANT : Tab / Shift+Tab bouclent à l'intérieur du conteneur `ref` ;
 * - à la FERMETURE : rend le scroll et restaure le focus sur le déclencheur s'il existe encore.
 *
 * L'Échap et le clic-extérieur restent gérés par le composant appelant (inchangés).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const declencheur =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const conteneur = ref.current
      if (!conteneur) return
      const focusables = Array.from(conteneur.querySelectorAll<HTMLElement>(FOCUSABLES))
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const premier = focusables[0]
      const dernier = focusables[focusables.length - 1]
      const actif = document.activeElement
      const dedans = actif instanceof HTMLElement && conteneur.contains(actif)
      if (e.shiftKey) {
        if (!dedans || actif === premier) {
          e.preventDefault()
          dernier.focus()
        }
      } else if (!dedans || actif === dernier) {
        e.preventDefault()
        premier.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (declencheur && declencheur.isConnected) declencheur.focus()
    }
  }, [active, ref])
}
