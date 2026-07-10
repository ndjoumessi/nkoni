import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Receipt,
  Scale,
  Check,
  ArrowRight,
  Rocket,
  UserPlus,
  TrendingUp,
  Building2,
  Users,
  Coins,
  CalendarCheck,
  Gavel,
  FileBarChart,
  WifiOff,
  Globe,
  ListChecks,
  Download,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { GlassmorphismTrustHero } from '@/components/ui/glassmorphism-trust-hero'
import { ButtonLink } from '@/components/ui/Button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/Badge'
import { Card, Overline } from '@/components/ui/Card'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { cn } from '@/lib/utils'

// Contact : mailto simple (pas de collecte d'emails en v1). Adresse validée avec le PO.
const CONTACT_EMAIL = 'nelson.djoumessi@gmail.com'

/** Page publique d'entrée de NKONI (avant authentification). */
export function LandingPage() {
  const { t } = useTranslation()
  const mailtoPro = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.forfaits.mailto.proSujet'))}`
  const mailtoEntreprise = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.forfaits.mailto.entrepriseSujet'))}`
  const mailtoContact = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.footerNav.contactSujet'))}`

  return (
    <main className="min-h-screen bg-background">
      <GlassmorphismTrustHero loginHref="/login" />

      {/* ── Comment ça marche : 3 étapes ─────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <SectionHeading
          overline={t('landing.etapes.overline')}
          titre={t('landing.etapes.titre')}
          description={t('landing.etapes.description')}
        />
        <ol className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <StepCard
            step={1}
            icon={Rocket}
            title={t('landing.etapes.creer.titre')}
            text={t('landing.etapes.creer.texte')}
          />
          <StepCard
            step={2}
            icon={UserPlus}
            title={t('landing.etapes.inviter.titre')}
            text={t('landing.etapes.inviter.texte')}
          />
          <StepCard
            step={3}
            icon={TrendingUp}
            title={t('landing.etapes.suivre.titre')}
            text={t('landing.etapes.suivre.texte')}
          />
        </ol>
      </section>

      {/* ── Pourquoi NKONI : 3 piliers + bande de capacités ──────────── */}
      <section id="a-propos" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-8">
        <SectionHeading
          overline={t('landing.apropos.overline')}
          titre={t('landing.apropos.titre')}
          description={t('landing.apropos.description')}
        />

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={ShieldCheck}
            tone="jade"
            title={t('landing.apropos.cards.statuts.titre')}
            text={t('landing.apropos.cards.statuts.texte')}
          />
          <FeatureCard
            icon={Scale}
            tone="brass"
            title={t('landing.apropos.cards.mouvements.titre')}
            text={t('landing.apropos.cards.mouvements.texte')}
          />
          <FeatureCard
            icon={Receipt}
            tone="jade"
            title={t('landing.apropos.cards.recus.titre')}
            text={t('landing.apropos.cards.recus.texte')}
          />
        </div>

        {/* Capacités « et aussi » — chips discrètes pour montrer l'étendue sans surcharger */}
        <div className="mt-8 rounded-3xl border border-hairline bg-surface-2/30 p-6 sm:p-8">
          <p className="text-center text-base font-medium text-foreground">
            {t('landing.capacites.titre')}
          </p>
          <p className="mx-auto mt-1 max-w-xl text-center text-sm text-muted-foreground">
            {t('landing.capacites.description')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {CAPACITES.map(({ key, icon: Icon }) => (
              <span
                key={key}
                className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-muted-foreground"
              >
                <Icon className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                {t(`landing.capacites.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pour qui : segments ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeading
          overline={t('landing.pourQui.overline')}
          titre={t('landing.pourQui.titre')}
          description={t('landing.pourQui.description')}
        />
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SegmentCard
            icon={Building2}
            title={t('landing.pourQui.associations.titre')}
            text={t('landing.pourQui.associations.texte')}
          />
          <SegmentCard
            icon={Users}
            title={t('landing.pourQui.familles.titre')}
            text={t('landing.pourQui.familles.texte')}
          />
          <SegmentCard
            icon={Coins}
            title={t('landing.pourQui.tontines.titre')}
            text={t('landing.pourQui.tontines.texte')}
          />
        </div>
      </section>

      {/* ── Sécurité & transparence ──────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-y border-hairline">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(720px 380px at 15% 0%, color-mix(in oklch, var(--brass) 12%, transparent), transparent 60%),' +
              'radial-gradient(680px 360px at 100% 100%, color-mix(in oklch, var(--amber) 8%, transparent), transparent 58%)',
          }}
        />
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHeading
            overline={t('landing.securite.overline')}
            titre={t('landing.securite.titre')}
            description={t('landing.securite.description')}
          />
          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TrustPoint
              icon={ShieldCheck}
              title={t('landing.securite.isolation.titre')}
              text={t('landing.securite.isolation.texte')}
            />
            <TrustPoint
              icon={ListChecks}
              title={t('landing.securite.tracabilite.titre')}
              text={t('landing.securite.tracabilite.texte')}
            />
            <TrustPoint
              icon={Download}
              title={t('landing.securite.exports.titre')}
              text={t('landing.securite.exports.texte')}
            />
          </div>
        </div>
      </section>

      {/* Forfaits — SEUL le Gratuit est fonctionnel (pas de facturation en v1, §0). Pro et
          Entreprise sont affichés « Bientôt disponible » : aucune souscription possible. */}
      <section id="forfaits" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
        <SectionHeading
          overline={t('landing.forfaits.overline')}
          titre={t('landing.forfaits.titre')}
          description={t('landing.forfaits.description')}
        />

        <div className="mt-14 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-3">
          {/* GRATUIT — actionnable, mis en avant */}
          <ForfaitCard
            nom={t('landing.forfaits.gratuit.nom')}
            tagline={t('landing.forfaits.gratuit.tagline')}
            prix={t('landing.forfaits.gratuit.prix')}
            disponible
            features={[
              t('landing.forfaits.gratuit.f1'),
              t('landing.forfaits.gratuit.f2'),
              t('landing.forfaits.gratuit.f3'),
              t('landing.forfaits.gratuit.f4'),
              t('landing.forfaits.gratuit.f5'),
            ]}
          >
            <ButtonLink to="/inscription" className="w-full">
              {t('commun.actions.creerMonEspace')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </ForfaitCard>

          {/* PRO — bientôt disponible, en retrait */}
          <ForfaitCard
            nom={t('landing.forfaits.pro.nom')}
            tagline={t('landing.forfaits.pro.tagline')}
            prix={t('landing.forfaits.pro.prix')}
            features={[
              t('landing.forfaits.pro.f1'),
              t('landing.forfaits.pro.f2'),
              t('landing.forfaits.pro.f3'),
              t('landing.forfaits.pro.f4'),
            ]}
          >
            <a href={mailtoPro} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              {t('landing.forfaits.pro.bouton')}
            </a>
          </ForfaitCard>

          {/* ENTREPRISE — sur devis, bientôt disponible, en retrait */}
          <ForfaitCard
            nom={t('landing.forfaits.entreprise.nom')}
            tagline={t('landing.forfaits.entreprise.tagline')}
            prix={t('landing.forfaits.entreprise.prix')}
            features={[
              t('landing.forfaits.entreprise.f1'),
              t('landing.forfaits.entreprise.f2'),
              t('landing.forfaits.entreprise.f3'),
            ]}
          >
            <a
              href={mailtoEntreprise}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              {t('landing.forfaits.entreprise.bouton')}
            </a>
          </ForfaitCard>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-faint">
          {t('landing.forfaits.note')}
        </p>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-6 pb-24">
        <SectionHeading
          overline={t('landing.faq.overline')}
          titre={t('landing.faq.titre')}
        />
        <div className="mt-12 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface-2/30">
          {FAQ_ITEMS.map((key) => (
            <FaqItem key={key} question={t(`landing.faq.${key}.q`)} reponse={t(`landing.faq.${key}.r`)} />
          ))}
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative isolate overflow-hidden rounded-3xl border border-brass/25 bg-surface-2/50 px-6 py-16 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(600px 300px at 50% 0%, color-mix(in oklch, var(--brass) 16%, transparent), transparent 65%)',
            }}
          />
          <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('landing.ctaFinal.titre')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
            {t('landing.ctaFinal.description')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink to="/inscription" size="lg">
              {t('commun.actions.creerMonEspace')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <Link
              to="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('landing.apropos.dejaEspace')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer enrichi ───────────────────────────────────────────── */}
      <footer className="border-t border-hairline">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <NkoniMark className="h-8 w-8 text-base" />
              <span className="font-display text-lg font-semibold tracking-tight">NKONI</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t('landing.footer')}</p>
          </div>

          <nav aria-label={t('landing.footerNav.produit')}>
            <Overline className="mb-3">{t('landing.footerNav.produit')}</Overline>
            <ul className="space-y-2 text-sm">
              <li>
                <FooterLink href="#a-propos">{t('landing.footerNav.pourquoi')}</FooterLink>
              </li>
              <li>
                <FooterLink href="#forfaits">{t('landing.footerNav.forfaits')}</FooterLink>
              </li>
              <li>
                <FooterLink href="#faq">{t('landing.footerNav.faq')}</FooterLink>
              </li>
            </ul>
          </nav>

          <nav aria-label={t('landing.footerNav.commencer')}>
            <Overline className="mb-3">{t('landing.footerNav.commencer')}</Overline>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/inscription" className="text-muted-foreground transition-colors hover:text-foreground">
                  {t('landing.footerNav.creer')}
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-muted-foreground transition-colors hover:text-foreground">
                  {t('landing.footerNav.seConnecter')}
                </Link>
              </li>
              <li>
                <a href={mailtoContact} className="text-muted-foreground transition-colors hover:text-foreground">
                  {t('landing.footerNav.contact')}
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-hairline py-6">
          <p className="text-center text-xs text-faint">{t('landing.footerNav.droits')}</p>
        </div>
      </footer>
    </main>
  )
}

// Capacités « et aussi » — clés i18n + icônes (libellés résolus à l'affichage, §4).
const CAPACITES: { key: string; icon: LucideIcon }[] = [
  { key: 'reunions', icon: CalendarCheck },
  { key: 'resolutions', icon: Gavel },
  { key: 'rapports', icon: FileBarChart },
  { key: 'recus', icon: Receipt },
  { key: 'horsLigne', icon: WifiOff },
  { key: 'multiDevise', icon: Globe },
]

const FAQ_ITEMS = ['cout', 'donnees', 'horsLigne', 'langues'] as const

/** En-tête de section réutilisable (overline menthe + titre display + description). */
function SectionHeading({
  overline,
  titre,
  description,
}: {
  overline: string
  titre: string
  description?: string
}) {
  return (
    <div className="text-center">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-brass/80">
        {overline}
      </p>
      <h2 className="mx-auto mt-3 max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {titre}
      </h2>
      {description && (
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

/** Étape numérotée du parcours de prise en main. */
function StepCard({
  step,
  icon: Icon,
  title,
  text,
}: {
  step: number
  icon: LucideIcon
  title: string
  text: string
}) {
  return (
    <li className="relative flex flex-col rounded-2xl border border-hairline bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-brass">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="num text-4xl font-semibold leading-none text-hairline-strong" aria-hidden="true">
          {step}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </li>
  )
}

/** Carte de segment de marché (Associations / Familles / Tontines). */
function SegmentCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <Card interactive className="flex flex-col p-6">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brass/10 text-brass ring-1 ring-inset ring-brass/20">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </Card>
  )
}

/** Point de confiance (sécurité), présenté à plat sur le bandeau. */
function TrustPoint({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-jade">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

/** Entrée FAQ — accordéon natif <details> (accessible, sans état ni JS). */
function FaqItem({ question, reponse }: { question: string; reponse: string }) {
  return (
    <details className="group px-5 sm:px-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-medium text-foreground [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="pb-5 text-pretty text-sm leading-relaxed text-muted-foreground">{reponse}</p>
    </details>
  )
}

/** Lien de footer vers une ancre de la page (scroll doux natif via CSS). */
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-muted-foreground transition-colors hover:text-foreground">
      {children}
    </a>
  )
}

/**
 * Carte de forfait. `disponible` = offre réellement souscriptible aujourd'hui (Gratuit) :
 * mise en avant (halo laiton, badge jade). Les autres sont en RETRAIT (opacité réduite,
 * badge « Bientôt disponible ») pour ne jamais laisser croire qu'on peut souscrire/payer.
 */
function ForfaitCard({
  nom,
  tagline,
  prix,
  disponible = false,
  features,
  children,
}: {
  nom: string
  tagline: string
  prix: string
  disponible?: boolean
  features: string[]
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card
      className={cn(
        'flex h-full flex-col p-6',
        disponible
          ? 'border-brass/40 ring-1 ring-brass/25 shadow-[0_24px_60px_-34px_oklch(0.84_0.14_168/40%)]'
          : 'opacity-65',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">{nom}</h3>
        {disponible ? (
          <Badge tone="jade" dot pulse>
            {t('landing.forfaits.disponible')}
          </Badge>
        ) : (
          <Badge tone="amber">{t('landing.forfaits.bientot')}</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>

      <div className="mt-5">
        <span
          className={cn(
            'font-display font-semibold',
            disponible ? 'text-3xl tracking-tight text-foreground' : 'text-xl text-faint',
          )}
        >
          {prix}
        </span>
      </div>

      <ul className="mt-5 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check
              className={cn('mt-0.5 h-4 w-4 shrink-0', disponible ? 'text-jade' : 'text-faint')}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">{children}</div>
    </Card>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: LucideIcon
  title: string
  text: string
  tone: 'brass' | 'jade'
}) {
  return (
    <Card interactive className="p-6">
      <div
        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 ${
          tone === 'jade' ? 'text-jade' : 'text-brass'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
    </Card>
  )
}

export default LandingPage
