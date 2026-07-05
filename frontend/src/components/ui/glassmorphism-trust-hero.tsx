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
  onDiscover?: () => void
}

const SAMPLE_STATS = { membres: 128, branches: 6, cotisationsAJour: 94 }

const STAT_ITEMS = [
  { value: `${SAMPLE_STATS.membres}`, label: 'Membres actifs' },
  { value: `${SAMPLE_STATS.branches}`, label: 'Groupes / branches' },
  { value: `${SAMPLE_STATS.cotisationsAJour}%`, label: 'Cotisations à jour' },
]

const VALUES: { label: string; icon: LucideIcon }[] = [
  { label: 'Trésorerie', icon: Wallet },
  { label: 'Transparence', icon: Eye },
  { label: 'Solidarité', icon: HeartHandshake },
  { label: 'Cotisations', icon: Coins },
  { label: 'Équilibrage', icon: Scale },
  { label: 'Branches', icon: Network },
]

const STATUS_LEGEND = [
  { label: 'À jour', dot: 'bg-jade' },
  { label: 'Partiel', dot: 'bg-amber' },
  { label: 'Non à jour', dot: 'bg-terra' },
]

export function GlassmorphismTrustHero({
  loginHref = '/login',
  onDiscover,
}: GlassmorphismTrustHeroProps) {
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
        <ButtonLink to={loginHref} variant="outline" size="sm">
          Se connecter
        </ButtonLink>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-20 pt-6 sm:pt-10 lg:grid-cols-2 lg:gap-16 lg:pb-28">
        {/* Colonne message */}
        <div className="text-center lg:text-left">
          <div className="nk-reveal nk-d1 inline-flex">
            <Badge tone="brass" size="lg" dot>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Gestion associative &amp; familiale
            </Badge>
          </div>

          <h1 className="nk-reveal nk-d2 mt-6 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl xl:text-[4.2rem]">
            <span className="block text-foreground">Les cotisations de</span>
            <span className="block bg-gradient-to-r from-brass via-amber to-jade bg-clip-text text-transparent">
              votre communauté
            </span>
            <span className="block text-foreground">en toute clarté</span>
          </h1>

          <p className="nk-reveal nk-d3 mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
            NKONI centralise le suivi des cotisations et la transparence financière de votre
            association, famille ou tontine : chaque membre connaît son statut, chaque mouvement
            est tracé, chaque reçu est archivé.
          </p>

          <div className="nk-reveal nk-d4 mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
            <ButtonLink to={loginHref} size="lg" icon={undefined}>
              Accéder à mon espace
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </ButtonLink>
            <Button variant="outline" size="lg" icon={Info} onClick={handleDiscover}>
              Découvrir NKONI
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
                <p className="text-sm font-medium text-foreground">Aperçu d'un espace</p>
                <p className="mt-0.5 text-xs text-faint">Données d'exemple — vitrine</p>
              </div>
              <Badge tone="jade" dot pulse>
                Actif
              </Badge>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-hairline bg-surface/70 p-4">
                <p className="num font-display text-3xl font-semibold tracking-tight text-foreground">
                  {SAMPLE_STATS.membres}
                </p>
                <p className="mt-1 text-xs text-faint">Membres</p>
              </div>
              <div className="rounded-2xl border border-hairline bg-surface/70 p-4">
                <p className="num font-display text-3xl font-semibold tracking-tight text-foreground">
                  {SAMPLE_STATS.branches}
                </p>
                <p className="mt-1 text-xs text-faint">Branches</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-hairline bg-surface/70 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted-foreground">Cotisations à jour</p>
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
                  <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
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
                Ce qui fait vivre un groupe
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
                      key={`${v.label}-${i}`}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface-2/70 px-4 py-2 text-sm text-muted-foreground"
                    >
                      <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
                      {v.label}
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
