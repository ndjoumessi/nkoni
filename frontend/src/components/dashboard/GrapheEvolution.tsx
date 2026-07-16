import { useEffect, useId, useMemo, useState } from 'react'
import { Activity, BarChart3 } from 'lucide-react'
import { Card, Overline } from '@/components/ui/Card'
import { formatMontant, formatNombre, formatPourcent } from '@/lib/format'
import { cn, prefersReducedMotion } from '@/lib/utils'

/**
 * Graphe d'évolution « collecté vs attendu » PARTAGÉ (§10) — extrait de RapportsPage pour
 * être réutilisé sur le tableau de bord. Deux rendus, même contrat de données :
 *   · `barres` : une paire de barres verticales par point (Rapports, série ANNUELLE) ;
 *   · `aire`   : une aire/ligne « collecté » sur une ligne de référence « attendu » pointillée
 *                (Dashboard, série MENSUELLE de l'année courante).
 *
 * Accessibilité (jamais d'encodage par la couleur seule) :
 *   - distinction de forme, pas que de teinte : attendu = piste/pointillé, collecté = plein ;
 *   - le visuel est `aria-hidden` ; un `role="img"` porte un résumé, et une TABLE `sr-only`
 *     (label / collecté / attendu / taux) donne l'équivalent chiffré complet.
 * Animation d'entrée respectant `prefers-reduced-motion` (montée gated).
 */

export interface PointEvolution {
  /** Clé React stable. */
  cle: string
  /** Libellé de l'axe X (année « 2025 » ou mois court « janv. »). */
  label: string
  attendu: number
  collecte: number
  /** Taux de recouvrement en %, affiché au-dessus des barres (variante `barres`). */
  taux?: number
  /** Collecté (cumulé) du même point l'année PRÉCÉDENTE — courbe de comparaison (variante `aire`). */
  collecteN1?: number
}

interface GrapheEvolutionProps {
  points: PointEvolution[]
  variant?: 'barres' | 'aire'
  titre: string
  legendeAttendu: string
  legendeCollecte: string
  /** Libellé de la courbe année précédente (comparaison N-1) ; absent → pas de courbe N-1. */
  legendeN1?: string
  /** En-têtes de la table accessible (équivalent chiffré). */
  labelColonne: string
  /** Résumé lu par les lecteurs d'écran (role="img"). */
  resumeAria: string
  /** Message si aucune donnée exploitable. */
  aucuneDonnee: string
}

/** Montée différée d'une frame, sautée si l'utilisateur a demandé moins d'animations. */
function useMonte(): boolean {
  const [monte, setMonte] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (monte) return
    const id = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(id)
  }, [monte])
  return monte
}

function Legende({
  variant,
  legendeAttendu,
  legendeCollecte,
  legendeN1,
}: {
  variant: 'barres' | 'aire'
  legendeAttendu: string
  legendeCollecte: string
  legendeN1?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-faint">
      <span className="inline-flex items-center gap-1.5">
        {variant === 'aire' ? (
          <span
            className="h-0 w-3.5 border-t-2 border-dashed border-faint"
            aria-hidden="true"
          />
        ) : (
          <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" aria-hidden="true" />
        )}
        {legendeAttendu}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-jade to-brass"
          aria-hidden="true"
        />
        {legendeCollecte}
      </span>
      {legendeN1 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-3.5 border-t-2 border-jade/70" aria-hidden="true" />
          {legendeN1}
        </span>
      )}
    </div>
  )
}

/** Barres verticales (attendu en piste, collecté en remplissage). */
function CorpsBarres({ points, monte }: { points: PointEvolution[]; monte: boolean }) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.attendu)), [points])
  return (
    <div
      className="mt-6 flex items-end justify-around gap-3 sm:gap-5"
      style={{ height: '13rem' }}
      aria-hidden="true"
    >
      {points.map((p) => {
        const hAttendu = (p.attendu / max) * 100
        const hCollecte = (p.collecte / max) * 100
        return (
          <div key={p.cle} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            {p.taux !== undefined && (
              <span className="num text-xs font-semibold text-jade">{formatPourcent(p.taux)}</span>
            )}
            <div className="relative flex h-full w-full max-w-[3.5rem] items-end justify-center">
              <div
                className="absolute bottom-0 w-full rounded-t-md bg-surface-3 transition-[height] duration-700 ease-out"
                style={{ height: `${monte ? hAttendu : 0}%` }}
              />
              <div
                className="absolute bottom-0 w-full rounded-t-md bg-gradient-to-b from-jade to-brass transition-[height] duration-700 ease-out"
                style={{ height: `${monte ? hCollecte : 0}%` }}
              />
            </div>
            <span className="num text-sm font-medium text-foreground">{p.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* Géométrie du graphe en aire (unités du viewBox — étiré à la largeur via preserveAspectRatio). */
const W = 640
const H = 200
const PAD_X = 12

/**
 * Aire/ligne « collecté » sur une référence « attendu » pointillée (série temporelle).
 *
 * Le viewBox est ÉTIRÉ (`preserveAspectRatio="none"`) pour occuper toute la largeur : les
 * traits gardent une épaisseur constante grâce à `vector-effect="non-scaling-stroke"`, et
 * AUCUN texte n'est placé dans le SVG (il serait déformé) — l'échelle max et les libellés
 * de mois sont rendus en HTML, alignés sur les points via des pourcentages de largeur.
 */
function CorpsAire({ points, monte, montreN1 }: { points: PointEvolution[]; monte: boolean; montreN1: boolean }) {
  const clipId = useId()
  const gradId = useId()
  const innerW = W - PAD_X * 2
  const max = useMemo(
    () => Math.max(1, ...points.flatMap((p) => [p.attendu, p.collecte, p.collecteN1 ?? 0])),
    [points],
  )
  const n = points.length
  const x = (i: number) => PAD_X + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => H * (1 - v / max)

  const ligneCollecte = points.map((p, i) => `${x(i)},${y(p.collecte)}`).join(' ')
  const ligneAttendu = points.map((p, i) => `${x(i)},${y(p.attendu)}`).join(' ')
  const ligneN1 = points.map((p, i) => `${x(i)},${y(p.collecteN1 ?? 0)}`).join(' ')
  const aire = `M ${x(0)},${H} ${points
    .map((p, i) => `L ${x(i)},${y(p.collecte)}`)
    .join(' ')} L ${x(n - 1)},${H} Z`
  const dernier = points[n - 1]
  const [hover, setHover] = useState<number | null>(null)
  const pointeur = hover !== null ? points[hover] : null

  return (
    <div className="mt-5">
      <div
        className="relative"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          if (rect.width === 0) return
          const ratio = (e.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))))
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Échelle haute (valeur max), lisible et non déformée. */}
        <span className="num absolute -top-1 left-0 z-10 text-3xs text-faint">
          {formatNombre(max)}
        </span>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-44 w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--brass)" stopOpacity="0.02" />
            </linearGradient>
            {/* Révélation gauche→droite au montage (respecte reduced-motion via `monte`). */}
            <clipPath id={clipId}>
              <rect
                x="0"
                y="0"
                height={H}
                width={monte ? W : 0}
                style={{ transition: 'width 900ms ease-out' }}
              />
            </clipPath>
          </defs>

          {/* Référence « attendu » (pointillée : distinction de FORME, pas que de couleur). */}
          <polyline
            points={ligneAttendu}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1.5"
            strokeDasharray="6 5"
            opacity="0.7"
            vectorEffect="non-scaling-stroke"
          />

          {/* Courbe année précédente (N-1) — trait fin jade, référence de comparaison. */}
          {montreN1 && (
            <polyline
              points={ligneN1}
              fill="none"
              stroke="var(--jade)"
              strokeWidth="1.75"
              opacity="0.55"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Aire + ligne « collecté » (révélées par le clip animé). */}
          <g clipPath={`url(#${clipId})`}>
            <path d={aire} fill={`url(#${gradId})`} />
            <polyline
              points={ligneCollecte}
              fill="none"
              stroke="var(--brass)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {dernier && (
              <circle cx={x(n - 1)} cy={y(dernier.collecte)} r="4" fill="var(--brass)" vectorEffect="non-scaling-stroke" />
            )}
          </g>

          {/* Survol : guide vertical + point mis en avant sur la valeur collectée. */}
          {pointeur && (
            <g>
              <line
                x1={x(hover as number)}
                y1={0}
                x2={x(hover as number)}
                y2={H}
                stroke="var(--hairline-strong)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover as number)}
                cy={y(pointeur.collecte)}
                r="4.5"
                fill="var(--brass)"
                stroke="var(--canvas)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {/* Infobulle au survol (visuelle ; l'équivalent chiffré accessible reste la table sr-only). */}
        {pointeur && (
          <div
            className={cn(
              'pointer-events-none absolute top-0 z-20 whitespace-nowrap rounded-lg border border-hairline-strong bg-surface-2 px-2.5 py-1.5 shadow-xl',
              hover === 0 ? 'translate-x-0' : hover === n - 1 ? '-translate-x-full' : '-translate-x-1/2',
            )}
            style={{ left: `${(x(hover as number) / W) * 100}%` }}
            aria-hidden="true"
          >
            <p className="text-2xs font-medium text-foreground">{pointeur.label}</p>
            <div className="mt-1 space-y-0.5 text-2xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-gradient-to-b from-jade to-brass" aria-hidden="true" />
                <span className="num">{formatMontant(pointeur.collecte)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-3 border-t border-dashed border-muted-foreground" aria-hidden="true" />
                <span className="num">{formatMontant(pointeur.attendu)}</span>
              </span>
              {montreN1 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-0 w-3 border-t border-jade/70" aria-hidden="true" />
                  <span className="num">{formatMontant(pointeur.collecteN1 ?? 0)}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Libellés de l'axe X (mois) en HTML, alignés sur les points → jamais déformés. Les
          extrêmes sont ANCRÉS (1er à gauche, dernier à droite) pour ne pas être écrêtés hors du
          cadre ; au-delà de 6 points, un mois sur deux est masqué en mobile (anti-chevauchement). */}
      <div className="relative mt-1.5 h-4">
        {points.map((p, i) => {
          const ancrage = i === 0 ? 'translate-x-0' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'
          const mobile = n > 6 && i % 2 === 1 ? 'hidden sm:inline-block' : 'inline-block'
          return (
            <span
              key={p.cle}
              className={cn('absolute text-3xs text-faint', ancrage, mobile)}
              style={{ left: `${(x(i) / W) * 100}%` }}
            >
              {p.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function GrapheEvolution({
  points,
  variant = 'barres',
  titre,
  legendeAttendu,
  legendeCollecte,
  legendeN1,
  labelColonne,
  resumeAria,
  aucuneDonnee,
}: GrapheEvolutionProps) {
  const monte = useMonte()
  const Icon = variant === 'aire' ? Activity : BarChart3
  const vide = points.length === 0 || points.every((p) => p.attendu === 0 && p.collecte === 0)
  const avecTaux = points.some((p) => p.taux !== undefined)
  const montreN1 = Boolean(legendeN1) && points.some((p) => (p.collecteN1 ?? 0) > 0)

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{titre}</Overline>
        </div>
        <Legende
          variant={variant}
          legendeAttendu={legendeAttendu}
          legendeCollecte={legendeCollecte}
          legendeN1={montreN1 ? legendeN1 : undefined}
        />
      </div>

      {vide ? (
        <p className="mt-6 text-sm text-faint">{aucuneDonnee}</p>
      ) : (
        <div role="img" aria-label={resumeAria}>
          {variant === 'aire' ? (
            <CorpsAire points={points} monte={monte} montreN1={montreN1} />
          ) : (
            <CorpsBarres points={points} monte={monte} />
          )}

          {/* Équivalent chiffré accessible (lecteurs d'écran). */}
          <table className="sr-only">
            <caption>{titre}</caption>
            <thead>
              <tr>
                <th scope="col">{labelColonne}</th>
                <th scope="col">{legendeCollecte}</th>
                <th scope="col">{legendeAttendu}</th>
                {montreN1 && <th scope="col">{legendeN1}</th>}
                {avecTaux && <th scope="col">%</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.cle}>
                  <th scope="row">{p.label}</th>
                  <td>{formatMontant(p.collecte)}</td>
                  <td>{formatMontant(p.attendu)}</td>
                  {montreN1 && <td>{formatMontant(p.collecteN1 ?? 0)}</td>}
                  {avecTaux && <td>{p.taux !== undefined ? formatPourcent(p.taux) : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default GrapheEvolution
