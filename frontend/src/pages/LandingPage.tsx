import { type ReactNode } from 'react'
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
const MAILTO_PRO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('NKONI Pro — être prévenu du lancement')}`
const MAILTO_ENTREPRISE = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('NKONI Entreprise — demande de renseignements')}`

/** Page publique d'entrée de NKONI (avant authentification). */
export function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <GlassmorphismTrustHero loginHref="/login" />

      <section id="a-propos" className="mx-auto max-w-5xl scroll-mt-8 px-6 py-24">
        <p className="text-center text-[0.72rem] font-medium uppercase tracking-[0.16em] text-brass/80">
          Pourquoi NKONI
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Pensé pour les familles et les associations
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted-foreground">
          Chaque groupe dispose de son propre espace, sécurisé et isolé : NKONI donne à chacun
          une vue claire et partagée de ses finances collectives, sans zone d'ombre — et aucune
          donnée n'est jamais partagée entre espaces.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={ShieldCheck}
            tone="jade"
            title="Statuts transparents"
            text="Chaque membre voit s'il est à jour, partiel ou non à jour, en temps réel."
          />
          <FeatureCard
            icon={Scale}
            tone="brass"
            title="Mouvements tracés"
            text="Les équilibrages entre branches sont enregistrés et vérifiables par tous."
          />
          <FeatureCard
            icon={Receipt}
            tone="jade"
            title="Reçus archivés"
            text="Chaque cotisation peut générer un reçu conservé et consultable à tout moment."
          />
        </div>

        <div className="mt-14 flex flex-col items-center gap-3">
          <ButtonLink to="/inscription" size="lg">
            Créer mon espace
          </ButtonLink>
          <Link
            to="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Vous avez déjà un espace ? Se connecter
          </Link>
        </div>
      </section>

      {/* Forfaits — SEUL le Gratuit est fonctionnel (pas de facturation en v1, §0). Pro et
          Entreprise sont affichés « Bientôt disponible » : aucune souscription possible. */}
      <section id="forfaits" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-24">
        <p className="text-center text-[0.72rem] font-medium uppercase tracking-[0.16em] text-brass/80">
          Forfaits
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Commencez gratuitement, évoluez à votre rythme
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-muted-foreground">
          Le forfait Gratuit est disponible dès aujourd'hui. Les offres Pro et Entreprise arrivent
          bientôt — aucune souscription payante n'est encore possible.
        </p>

        <div className="mt-14 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-3">
          {/* GRATUIT — actionnable, mis en avant */}
          <ForfaitCard
            nom="Gratuit"
            tagline="Pour commencer"
            prix="Gratuit"
            disponible
            features={[
              "Jusqu'à 100 membres",
              'Membres, cotisations & versements',
              'Réunions, fonctions & résolutions',
              'Rapports financiers & exports',
              'Espace sécurisé, isolé des autres',
            ]}
          >
            <ButtonLink to="/inscription" className="w-full">
              Créer mon espace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </ForfaitCard>

          {/* PRO — bientôt disponible, en retrait */}
          <ForfaitCard
            nom="Pro"
            tagline="Pour grandir"
            prix="Tarif à venir"
            features={[
              'Membres illimités',
              'Documents illimités',
              'Support prioritaire',
              'Export avancé',
            ]}
          >
            <a href={MAILTO_PRO} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              Être prévenu du lancement
            </a>
          </ForfaitCard>

          {/* ENTREPRISE — sur devis, bientôt disponible, en retrait */}
          <ForfaitCard
            nom="Entreprise"
            tagline="Sur mesure"
            prix="Sur devis"
            features={[
              'Grandes structures & fédérations',
              "Accompagnement dédié à l'onboarding",
              'Sans engagement',
            ]}
          >
            <a
              href={MAILTO_ENTREPRISE}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              Nous contacter
            </a>
          </ForfaitCard>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-faint">
          Les forfaits Pro et Entreprise ne sont pas encore commercialisés. Les fonctionnalités
          annoncées sont indicatives et pourront évoluer d'ici leur lancement.
        </p>
      </section>

      <footer className="border-t border-hairline py-8">
        <p className="text-center text-xs text-faint">
          NKONI — gestion des cotisations &amp; transparence financière.
        </p>
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
  return (
    <Card
      className={cn(
        'flex h-full flex-col p-6',
        disponible
          ? 'border-brass/30 ring-1 ring-brass/25 shadow-[0_24px_60px_-34px_oklch(0.805_0.116_84/45%)]'
          : 'opacity-65',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">{nom}</h3>
        {disponible ? (
          <Badge tone="jade" dot pulse>
            Disponible
          </Badge>
        ) : (
          <Badge tone="amber">Bientôt disponible</Badge>
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
