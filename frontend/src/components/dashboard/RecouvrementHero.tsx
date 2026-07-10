import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatMontant, formatPourcent } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/utils'

/** Jauge circulaire menthe pour le taux de recouvrement. */
function Gauge({ value }: { value: number }) {
  const { t } = useTranslation()
  const pct = Math.max(0, Math.min(100, value))
  const size = 148
  const stroke = 13
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  // Animation d'entrée (§10) : l'anneau se remplit de 0 vers `pct`. Livré direct si
  // l'utilisateur préfère moins d'animations.
  const [affiche, setAffiche] = useState(() => (prefersReducedMotion() ? pct : 0))
  useEffect(() => {
    if (prefersReducedMotion()) {
      setAffiche(pct)
      return
    }
    const id = requestAnimationFrame(() => setAffiche(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  const offset = c * (1 - affiche / 100)

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
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-3xl font-semibold tracking-tight text-foreground">
          {formatPourcent(Math.round(pct))}
        </span>
        <span className="mt-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-faint">
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
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-brass/80">
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
            <span className="num text-lg font-semibold text-foreground">{formatMontant(collecte)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface/60 px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-brass">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </span>
              {t('dashboard.hero.totalAttendu')}
            </span>
            <span className="num text-lg font-semibold text-foreground">{formatMontant(attendu)}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default RecouvrementHero
