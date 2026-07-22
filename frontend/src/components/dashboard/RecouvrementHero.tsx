import { useTranslation } from 'react-i18next'
import { Coins, TrendingDown, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Montant } from '@/components/ui/Montant'
import { formatPourcent } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'

/** Jauge circulaire menthe pour le taux de recouvrement. */
function Gauge({ value }: { value: number }) {
  const { t } = useTranslation()
  const pct = Math.max(0, Math.min(100, value))
  const size = 148
  const stroke = 13
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  // Animation d'entrée (§10) : le NOMBRE et le remplissage de l'anneau montent de 0 → `pct` à la
  // même cadence (une seule valeur rAF les pilote) — parfaitement synchrones. `useCountUp` respecte
  // `prefers-reduced-motion` (rendu direct, sans animation).
  const anime = useCountUp(pct)
  const offset = c * (1 - anime / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="nk-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brass)" />
            <stop offset="100%" stopColor="var(--jade)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#nk-gauge)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-3xl font-semibold tracking-tight text-foreground">
          {formatPourcent(Math.round(anime))}
        </span>
        <span className="mt-0.5 text-3xs uppercase tracking-[0.12em] text-faint">
          {t('dashboard.hero.recouvre')}
        </span>
      </div>
    </div>
  )
}

/** Bloc dominant du dashboard : la métrique clé (recouvrement) domine visuellement. */
export function RecouvrementHero({
  taux,
  collecte,
  attendu,
}: {
  taux: number
  collecte: number
  attendu: number
}) {
  const { t } = useTranslation()
  return (
    <Card variant="feature" className="p-6 sm:p-7">
      <p className="text-2xs font-medium uppercase tracking-[0.14em] text-brass/80">
        {t('dashboard.hero.indicateur')}
      </p>
      <div className="mt-5 flex flex-col items-center gap-7 sm:flex-row sm:gap-9">
        <Gauge value={taux} />
        <div className="w-full flex-1 space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface/60 px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-jade">
                <Coins className="h-4 w-4" aria-hidden="true" />
              </span>
              {t('dashboard.hero.totalCollecte')}
            </span>
            <Montant value={collecte} className="text-lg font-semibold text-foreground" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface/60 px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-brass">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </span>
              {t('dashboard.hero.totalAttendu')}
            </span>
            <Montant value={attendu} className="text-lg font-semibold text-foreground" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface/60 px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-terra">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              </span>
              {t('dashboard.hero.resteACollecter')}
            </span>
            <Montant
              value={Math.max(0, attendu - collecte)}
              className="text-lg font-semibold text-terra"
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

export default RecouvrementHero
