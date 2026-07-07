import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Info,
  Wallet,
  Eye,
  HeartHandshake,
  Coins,
  Scale,
  Network,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { NkoniMark } from '@/components/ui/NkoniMark'

/**
 * NKONI — Hero de la page publique (avant authentification).
 * Direction « Laiton & Jade » : encre chaude, laiton comme accent rare, titres Fraunces.
 *
 * Toutes les valeurs chiffrées sont des exemples statiques pour la vitrine — aucune
 * donnée réelle de membre n'est exposée ici.
 */

interface GlassmorphismTrustHeroProps {
  loginHref?: string
  inscriptionHref?: string
  onDiscover?: () => void
}

const SAMPLE_STATS = { membres: 128, branches: 6, cotisationsAJour: 94 }

// Libellés résolus à l'affichage (§4 i18n) : ces tableaux ne portent que des clés + icônes.
const VALUES: { key: string; icon: LucideIcon }[] = [
  { key: 'tresorerie', icon: Wallet },
  { key: 'transparence', icon: Eye },
  { key: 'solidarite', icon: HeartHandshake },
  { key: 'cotisations', icon: Coins },
  { key: 'equilibrage', icon: Scale },
  { key: 'branches', icon: Network },
]

const STATUS_LEGEND = [
  { key: 'aJour', dot: 'bg-jade' },
  { key: 'partiel', dot: 'bg-amber' },
  { key: 'nonAJour', dot: 'bg-terra' },
]

export function GlassmorphismTrustHero({
  loginHref = '/login',
  inscriptionHref = '/inscription',
  onDiscover,
}: GlassmorphismTrustHeroProps) {
  const { t } = useTranslation()

  const STAT_ITEMS = [
    { value: `${SAMPLE_STATS.membres}`, label: t('landing.hero.stats.membresActifs') },
    { value: `${SAMPLE_STATS.branches}`, label: t('landing.hero.stats.groupesBranches') },
    { value: `${SAMPLE_STATS.cotisationsAJour}%`, label: t('landing.hero.stats.cotisationsAJour') },
  ]

  const handleDiscover = () => {
    if (onDiscover) return onDiscover()
    document.getElementById('a-propos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20"
        style={{
          background:
            'radial-gradient(1100px 620px at 12% -12%, oklch(0.805 0.116 84 / 20%), transparent 60%),' +
            'radial-gradient(900px 520px at 108% 4%, oklch(0.735 0.128 166 / 15%), transparent 58%),' +
            'radial-gradient(700px 700px at 50% 122%, oklch(0.672 0.157 39 / 10%), transparent 60%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
          maskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
        }}
      />
      <div className="nk-grid absolute inset-0 -z-10" aria-hidden="true" />

      {/* Barre de marque */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <NkoniMark className="h-9 w-9 text-lg" />
          <span className="font-display text-xl font-semibold tracking-tight">NKONI</span>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink to={inscriptionHref} size="sm">
            {t('commun.actions.creerMonEspace')}
          </ButtonLink>
          <ButtonLink to={loginHref} variant="outline" size="sm">
            {t('commun.actions.seConnecter')}
          </ButtonLink>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-20 pt-6 sm:pt-10 lg:grid-cols-2 lg:gap-16 lg:pb-28">
        {/* Colonne message */}
        <div className="text-center lg:text-left">
          <div className="nk-reveal nk-d1 inline-flex">
            <Badge tone="brass" size="lg" dot>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('landing.hero.badge')}
            </Badge>
          </div>

          <h1 className="nk-reveal nk-d2 mt-6 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl xl:text-[4.2rem]">
            <span className="block text-foreground">{t('landing.hero.titre.ligne1')}</span>
            <span className="block bg-gradient-to-r from-brass via-amber to-jade bg-clip-text text-transparent">
              {t('landing.hero.titre.ligne2')}
            </span>
            <span className="block text-foreground">{t('landing.hero.titre.ligne3')}</span>
          </h1>

          <p className="nk-reveal nk-d3 mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
            {t('landing.hero.description.partie1')}{' '}
            <span className="text-foreground">{t('landing.hero.description.emphase')}</span>
            {t('landing.hero.description.partie2')}
          </p>

          <div className="nk-reveal nk-d4 mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
            <ButtonLink to={inscriptionHref} size="lg" icon={undefined}>
              {t('commun.actions.creerMonEspace')}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </ButtonLink>
            <Button variant="outline" size="lg" icon={Info} onClick={handleDiscover}>
              {t('landing.hero.decouvrir')}
            </Button>
          </div>

          <div className="nk-reveal nk-d5 mt-12 grid grid-cols-3 gap-6 border-t border-hairline pt-8">
            {STAT_ITEMS.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="num font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {item.value}
                </span>
                <span className="mt-1 text-xs text-faint sm:text-sm">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne aperçu */}
        <div className="nk-reveal nk-d3 flex flex-col gap-5">
          <div className="rounded-3xl border border-brass/20 bg-surface-2/70 p-6 shadow-[0_30px_80px_-40px_oklch(0_0_0/80%)] ring-1 ring-inset ring-brass/5 backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t('landing.hero.apercu.titre')}</p>
                <p className="mt-0.5 text-xs text-faint">{t('landing.hero.apercu.sousTitre')}</p>
              </div>
              <Badge tone="jade" dot pulse>
                {t('landing.hero.apercu.actif')}
              </Badge>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-hairline bg-surface/70 p-4">
                <p className="num font-display text-3xl font-semibold tracking-tight text-foreground">
                  {SAMPLE_STATS.membres}
                </p>
                <p className="mt-1 text-xs text-faint">{t('landing.hero.apercu.membres')}</p>
              </div>
              <div className="rounded-2xl border border-hairline bg-surface/70 p-4">
                <p className="num font-display text-3xl font-semibold tracking-tight text-foreground">
                  {SAMPLE_STATS.branches}
                </p>
                <p className="mt-1 text-xs text-faint">{t('landing.hero.apercu.branches')}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-hairline bg-surface/70 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">{t('landing.hero.apercu.cotisationsAJour')}</p>
                <p className="num text-sm font-semibold text-jade">{SAMPLE_STATS.cotisationsAJour}%</p>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-jade to-brass"
                  style={{ width: `${SAMPLE_STATS.cotisationsAJour}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {STATUS_LEGEND.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {t(`landing.hero.apercu.legende.${s.key}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Marquee des valeurs */}
          <div className="overflow-hidden rounded-3xl border border-hairline bg-surface/60 p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2 px-1">
              <HeartHandshake className="h-4 w-4 text-jade" aria-hidden="true" />
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-faint">
                {t('landing.hero.valeurs.titre')}
              </p>
            </div>
            <div
              className="relative overflow-hidden"
              style={{
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
                maskImage: 'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
              }}
            >
              <div className="nk-marquee gap-3">
                {[...VALUES, ...VALUES].map((v, i) => {
                  const Icon = v.icon
                  return (
                    <span
                      key={`${v.key}-${i}`}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface-2/70 px-4 py-2 text-sm text-muted-foreground"
                    >
                      <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
                      {t(`landing.hero.valeurs.${v.key}`)}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default GlassmorphismTrustHero
