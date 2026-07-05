import { ShieldCheck, Receipt, Scale, type LucideIcon } from 'lucide-react'
import { GlassmorphismTrustHero } from '@/components/ui/glassmorphism-trust-hero'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

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
          NKONI donne à chaque groupe une vue claire et partagée de ses finances collectives,
          sans zone d'ombre.
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

        <div className="mt-14 flex justify-center">
          <ButtonLink to="/login" size="lg">
            Accéder à mon espace
          </ButtonLink>
        </div>
      </section>

      <footer className="border-t border-hairline py-8">
        <p className="text-center text-xs text-faint">
          NKONI — gestion des cotisations &amp; transparence financière.
        </p>
      </footer>
    </main>
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
