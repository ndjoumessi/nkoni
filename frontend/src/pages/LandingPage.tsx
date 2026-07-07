import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ShieldCheck, Receipt, Scale, Check, ArrowRight, type LucideIcon } from 'lucide-react'
import { GlassmorphismTrustHero } from '@/components/ui/glassmorphism-trust-hero'
import { ButtonLink } from '@/components/ui/Button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

// Contact : mailto simple (pas de collecte d'emails en v1). Adresse validée avec le PO.
const CONTACT_EMAIL = 'nelson.djoumessi@gmail.com'

/** Page publique d'entrée de NKONI (avant authentification). */
export function LandingPage() {
  const { t } = useTranslation()
  const mailtoPro = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.forfaits.mailto.proSujet'))}`
  const mailtoEntreprise = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('landing.forfaits.mailto.entrepriseSujet'))}`

  return (
    <main className="min-h-screen bg-background">
      <GlassmorphismTrustHero loginHref="/login" />

      <section id="a-propos" className="mx-auto max-w-5xl scroll-mt-8 px-6 py-24">
        <p className="text-center text-[0.72rem] font-medium uppercase tracking-[0.16em] text-brass/80">
          {t('landing.apropos.overline')}
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.apropos.titre')}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted-foreground">
          {t('landing.apropos.description')}
        </p>

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

        <div className="mt-14 flex flex-col items-center gap-3">
          <ButtonLink to="/inscription" size="lg">
            {t('commun.actions.creerMonEspace')}
          </ButtonLink>
          <Link
            to="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('landing.apropos.dejaEspace')}
          </Link>
        </div>
      </section>

      {/* Forfaits — SEUL le Gratuit est fonctionnel (pas de facturation en v1, §0). Pro et
          Entreprise sont affichés « Bientôt disponible » : aucune souscription possible. */}
      <section id="forfaits" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-24">
        <p className="text-center text-[0.72rem] font-medium uppercase tracking-[0.16em] text-brass/80">
          {t('landing.forfaits.overline')}
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('landing.forfaits.titre')}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted-foreground">
          {t('landing.forfaits.description')}
        </p>

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

      <footer className="border-t border-hairline py-8">
        <p className="text-center text-xs text-faint">{t('landing.footer')}</p>
      </footer>
    </main>
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
