import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/utils'

/**
 * Compte de 0 → `cible` en `duree` ms (courbe ease-out cubique), rejoué au changement de cible.
 *
 * Animation « senior » cohérente avec les remplissages d'anneau/arcs du dashboard : le NOMBRE monte
 * en synchronisation avec le visuel plutôt que d'apparaître d'un coup. Respecte
 * `prefers-reduced-motion` (rend `cible` immédiatement, aucun rAF). Renvoie une valeur flottante —
 * l'appelant arrondit/formate selon l'usage (pourcentage entier, montant, décompte).
 */
export function useCountUp(cible: number, duree = 900): number {
  const [valeur, setValeur] = useState(() => (prefersReducedMotion() ? cible : 0))
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValeur(cible)
      return
    }
    const depart = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - depart) / duree)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setValeur(cible * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [cible, duree])

  return valeur
}
