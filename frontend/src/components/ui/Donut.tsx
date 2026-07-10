import type { ReactNode } from 'react'

/**
 * Donut proportionnel (SVG, sans lib de charts). Chaque segment est un arc d'un cercle
 * unique via `stroke-dasharray` normalisé (`pathLength=100`) → la longueur d'un segment
 * vaut directement son pourcentage. Le trait suit `currentColor` : passer la couleur par
 * une classe utilitaire `text-*` (jamais un encodage par la couleur SEULE — la légende
 * chiffrée qui l'accompagne porte les libellés + valeurs).
 *
 * `monte` pilote l'animation d'entrée (les arcs poussent de 0 → leur part) ; le parent la
 * neutralise pour `prefers-reduced-motion`. `centre` s'affiche au cœur du donut (total…).
 */

export interface SegmentDonut {
  cle: string
  valeur: number
  /** Classe de couleur du texte (le trait de l'arc utilise `currentColor`). */
  couleur: string
}

export function Donut({
  segments,
  total,
  taille = 132,
  epaisseur = 16,
  monte = true,
  centre,
}: {
  segments: SegmentDonut[]
  total: number
  taille?: number
  epaisseur?: number
  monte?: boolean
  centre?: ReactNode
}) {
  const r = (taille - epaisseur) / 2
  const c = taille / 2
  let cumul = 0

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg viewBox={`0 0 ${taille} ${taille}`} width={taille} height={taille} aria-hidden="true">
        <g transform={`rotate(-90 ${c} ${c})`}>
          {/* Piste de fond (100%). */}
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={epaisseur} />
          {segments.map((s) => {
            const pct = total > 0 ? (s.valeur / total) * 100 : 0
            const offset = cumul
            cumul += pct
            if (pct <= 0) return null
            return (
              <circle
                key={s.cle}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke="currentColor"
                className={s.couleur}
                strokeWidth={epaisseur}
                pathLength={100}
                strokeDasharray={`${monte ? pct : 0} 100`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                style={{ transition: 'stroke-dasharray 800ms ease-out' }}
              />
            )
          })}
        </g>
      </svg>
      {centre && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {centre}
        </div>
      )}
    </div>
  )
}

export default Donut
