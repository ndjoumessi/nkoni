import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Users,
  Info,
  Wallet,
  Eye,
  HeartHandshake,
  Coins,
  Scale,
  Network,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

/**
 * NKONI — Hero glassmorphism (page publique, avant authentification).
 *
 * Toutes les valeurs chiffrées ci-dessous sont des exemples statiques destinés
 * à la vitrine publique. Aucune donnée réelle de membre n'est exposée ici :
 * les vrais chiffres viendront de l'API une fois l'utilisateur authentifié.
 */

interface GlassmorphismTrustHeroProps {
  /** Cible du CTA « Se connecter ». Défaut : /login */
  loginHref?: string
  /** Action du CTA « Découvrir NKONI ». Défaut : scroll vers #a-propos */
  onDiscover?: () => void
}

// --- Données d'exemple (statiques, publiques) ---------------------------------
const SAMPLE_STATS = {
  membres: 128,
  branches: 6,
  cotisationsAJour: 94, // %
}

const STAT_ITEMS: { value: string; label: string }[] = [
  { value: `${SAMPLE_STATS.membres}`, label: 'Membres actifs' },
  { value: `${SAMPLE_STATS.branches}`, label: 'Branches familiales' },
  { value: `${SAMPLE_STATS.cotisationsAJour}%`, label: 'Cotisations à jour' },
]

// Valeurs de l'association pour le marquee (remplace les faux clients tech).
const VALUES: { label: string; icon: LucideIcon }[] = [
  { label: 'Trésorerie', icon: Wallet },
  { label: 'Transparence', icon: Eye },
  { label: 'Solidarité', icon: HeartHandshake },
  { label: 'Cotisations', icon: Coins },
  { label: 'Équilibrage', icon: Scale },
  { label: 'Branches familiales', icon: Network },
]

// Répartition d'exemple des statuts de cotisation (à jour / partiel / non à jour).
const STATUS_LEGEND: { label: string; dot: string }[] = [
  { label: 'À jour', dot: 'bg-emerald-400' },
  { label: 'Partiel', dot: 'bg-amber-400' },
  { label: 'Non à jour', dot: 'bg-rose-400' },
]

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {value}
      </span>
      <span className="mt-1 text-xs text-white/50 sm:text-sm">{label}</span>
    </div>
  )
}

export function GlassmorphismTrustHero({
  loginHref = '/login',
  onDiscover,
}: GlassmorphismTrustHeroProps) {
  const handleDiscover = () => {
    if (onDiscover) {
      onDiscover()
      return
    }
    document
      .getElementById('a-propos')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="nkoni-hero relative isolate overflow-hidden bg-[#0b0b12] text-white">
      {/* Styles scopés : dégradés, masque, animations */}
      <style>{`
        .nkoni-hero {
          --nk-accent: 129 140 248;   /* indigo-400 */
          --nk-accent-2: 56 189 248;  /* sky-400 */
        }
        .nkoni-hero__bg {
          position: absolute;
          inset: 0;
          z-index: -2;
          background:
            radial-gradient(1100px 620px at 12% -12%, rgba(129,140,248,0.28), transparent 60%),
            radial-gradient(900px 520px at 108% 4%, rgba(56,189,248,0.20), transparent 58%),
            radial-gradient(700px 700px at 50% 120%, rgba(16,185,129,0.12), transparent 60%),
            linear-gradient(180deg, #0b0b12 0%, #0e0f1a 52%, #0b0b12 100%);
          -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 68%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 0%, #000 68%, transparent 100%);
        }
        .nkoni-hero__grid {
          position: absolute;
          inset: 0;
          z-index: -1;
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px);
          background-size: 56px 56px;
          -webkit-mask-image: radial-gradient(900px 600px at 30% 10%, #000, transparent 75%);
          mask-image: radial-gradient(900px 600px at 30% 10%, #000, transparent 75%);
        }
        @keyframes nkoniFadeSlideIn {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nkoniMarquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .nk-animate {
          opacity: 0;
          animation: nkoniFadeSlideIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .nk-d1 { animation-delay: 0.05s; }
        .nk-d2 { animation-delay: 0.15s; }
        .nk-d3 { animation-delay: 0.25s; }
        .nk-d4 { animation-delay: 0.35s; }
        .nk-d5 { animation-delay: 0.45s; }
        .nk-marquee-track {
          display: flex;
          width: max-content;
          animation: nkoniMarquee 26s linear infinite;
        }
        .nkoni-hero:hover .nk-marquee-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .nk-animate { opacity: 1; animation: none; }
          .nk-marquee-track { animation: none; }
        }
      `}</style>

      <div className="nkoni-hero__bg" aria-hidden="true" />
      <div className="nkoni-hero__grid" aria-hidden="true" />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        {/* ---- Colonne gauche : message ---- */}
        <div className="text-center lg:text-left">
          {/* Badge du haut */}
          <div className="nk-animate nk-d1 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white/80 backdrop-blur-md">
            <Users className="h-4 w-4 text-indigo-300" aria-hidden="true" />
            <span>Plateforme de gestion familiale</span>
          </div>

          {/* Titre principal (3 lignes, dégradé sur la ligne du milieu) */}
          <h1 className="nk-animate nk-d2 mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
            <span className="block text-white/90">Gérer la famille</span>
            <span className="block bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
              WAMBA TCHOUPA
            </span>
            <span className="block text-white/90">en toute transparence</span>
          </h1>

          {/* Description */}
          <p className="nk-animate nk-d3 mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg lg:mx-0">
            NKONI centralise le suivi des cotisations et la transparence
            financière entre les branches familiales : chaque membre connaît son
            statut, chaque équilibrage est tracé, chaque reçu est archivé.
          </p>

          {/* CTAs */}
          <div className="nk-animate nk-d4 mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to={loginHref}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12]"
            >
              Se connecter
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={handleDiscover}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12]"
            >
              <Info className="h-4 w-4 text-indigo-300" aria-hidden="true" />
              Découvrir NKONI
            </button>
          </div>

          {/* Mini stats grid */}
          <div className="nk-animate nk-d5 mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {STAT_ITEMS.map((item) => (
              <StatItem key={item.label} value={item.value} label={item.label} />
            ))}
          </div>
        </div>

        {/* ---- Colonne droite : cartes en verre ---- */}
        <div className="nk-animate nk-d3 flex flex-col gap-5">
          {/* Carte de stats principale */}
          <div className="rounded-3xl border border-white/12 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/70">
                  Aperçu de l'association
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  Données d'exemple — vitrine publique
                </p>
              </div>
              {/* Tag pill ACTIF — statut système en temps réel */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                ACTIF
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-3xl font-semibold tracking-tight text-white">
                  {SAMPLE_STATS.membres}
                </p>
                <p className="mt-1 text-xs text-white/50">Membres</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-3xl font-semibold tracking-tight text-white">
                  {SAMPLE_STATS.branches}
                </p>
                <p className="mt-1 text-xs text-white/50">Branches familiales</p>
              </div>
            </div>

            {/* Cotisations à jour + barre de progression */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-white/70">Cotisations à jour</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {SAMPLE_STATS.cotisationsAJour}%
                </p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                  style={{ width: `${SAMPLE_STATS.cotisationsAJour}%` }}
                />
              </div>
              {/* Légende des statuts */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {STATUS_LEGEND.map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1.5 text-xs text-white/55"
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Carte marquee — les valeurs de l'association */}
          <div className="overflow-hidden rounded-3xl border border-white/12 bg-white/[0.06] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2 px-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                Ce qui fait vivre l'association
              </p>
            </div>
            <div
              className="relative overflow-hidden"
              style={{
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
                maskImage:
                  'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)',
              }}
            >
              <div className="nk-marquee-track gap-3">
                {[...VALUES, ...VALUES].map((v, i) => {
                  const Icon = v.icon
                  return (
                    <span
                      key={`${v.label}-${i}`}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/75"
                    >
                      <Icon className="h-4 w-4 text-indigo-300" aria-hidden="true" />
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
