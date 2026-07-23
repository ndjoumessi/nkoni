import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Circle,
  Coins,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Card, Overline } from '@/components/ui/Card'
import { ButtonLink, Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/** État de configuration de l'espace — dérivé des données du dashboard (aucun appel dédié). */
export interface EtapesDemarrage {
  bareme: boolean
  membres: boolean
  versement: boolean
}

const CLE_MASQUE = 'nkoni:guide-demarrage-masque'

interface DefinitionEtape {
  cle: keyof EtapesDemarrage
  icon: LucideIcon
  to: string
}

// Ordre logique de mise en route : barème → membres → premier versement.
const ETAPES: DefinitionEtape[] = [
  { cle: 'bareme', icon: CalendarRange, to: '/bareme' },
  { cle: 'membres', icon: Users, to: '/membres/nouveau' },
  { cle: 'versement', icon: Coins, to: '/membres' },
]

/**
 * Guide « Premiers pas » (onboarding §1.2) — checklist PROGRESSIVE qui suit l'état réel de
 * configuration de l'espace et oriente vers l'action manquante suivante. Remplace l'ancien empty
 * state tout-ou-rien : il accompagne aussi une org à moitié configurée (barème posé, membres
 * ajoutés, mais aucun versement encore). Le parent ne l'affiche qu'aux rôles de gestion et tant que
 * la mise en route n'est pas terminée. Masquable (préférence locale) ; réapparaît jamais une fois
 * toutes les étapes faites, puisque le parent cesse de le monter.
 */
export function GuideDemarrage({ etapes }: { etapes: EtapesDemarrage }) {
  const { t } = useTranslation()
  const [masque, setMasque] = useState(() => {
    try {
      return localStorage.getItem(CLE_MASQUE) === '1'
    } catch {
      return false
    }
  })

  if (masque) return null

  const faites = ETAPES.filter((e) => etapes[e.cle]).length
  const masquer = () => {
    try {
      localStorage.setItem(CLE_MASQUE, '1')
    } catch {
      /* stockage indisponible (mode privé strict) → on masque juste pour la session */
    }
    setMasque(true)
  }

  return (
    <Card variant="feature" className="relative p-6 sm:p-7">
      <button
        type="button"
        onClick={masquer}
        aria-label={t('dashboard.guide.masquer')}
        // Bouton ABSOLUTE → pas de .tap-target (position:relative le casserait, régression vécue).
        // Cible portée à 44px en agrandissant le bouton ; ancres right-1.5/top-1.5 (6px) + h-11/w-11
        // → centre à 28px des bords, soit exactement l'ancien right-4/top-4 + p-1 : la croix ne bouge pas.
        className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('dashboard.guide.overline')}</Overline>
      </div>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
        {t('dashboard.guide.titre')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('dashboard.guide.progression', { faites, total: ETAPES.length })}
      </p>

      <ol className="mt-5 space-y-2.5">
        {ETAPES.map(({ cle, icon: Icon, to }) => {
          const fait = etapes[cle]
          return (
            <li
              key={cle}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors',
                fait ? 'border-jade/25 bg-jade/[0.06]' : 'border-hairline bg-surface/60',
              )}
            >
              {fait ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-jade" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-faint" aria-hidden="true" />
              )}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-brass">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    fait ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {t(`dashboard.guide.etapes.${cle}.titre`)}
                </span>
                <span className="block text-xs text-faint">
                  {t(`dashboard.guide.etapes.${cle}.description`)}
                </span>
              </span>
              {fait ? (
                <span className="shrink-0 text-xs font-medium text-jade">
                  {t('dashboard.guide.fait')}
                </span>
              ) : (
                <ButtonLink to={to} variant="outline" size="sm">
                  {t('dashboard.guide.faire')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </ButtonLink>
              )}
            </li>
          )
        })}
      </ol>

      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={masquer}>
          {t('dashboard.guide.ignorer')}
        </Button>
      </div>
    </Card>
  )
}

export default GuideDemarrage
