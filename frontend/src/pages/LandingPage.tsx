import { Link } from 'react-router-dom'
import { ShieldCheck, Receipt, Scale } from 'lucide-react'
import { GlassmorphismTrustHero } from '@/components/ui/glassmorphism-trust-hero'

/**
 * Page publique d'entrée de NKONI (avant authentification).
 */
export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0b0b12]">
      <GlassmorphismTrustHero loginHref="/login" />

      {/* Cible du CTA « Découvrir NKONI » */}
      <section
        id="a-propos"
        className="mx-auto max-w-5xl scroll-mt-8 px-6 py-20 text-white"
      >
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Pensé pour la famille WAMBA TCHOUPA
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/60">
          NKONI donne à chaque branche une vue claire et partagée des finances
          familiales, sans zone d'ombre.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5 text-emerald-300" />}
            title="Statuts transparents"
            text="Chaque membre voit s'il est à jour, partiel ou non à jour, en temps réel."
          />
          <FeatureCard
            icon={<Scale className="h-5 w-5 text-sky-300" />}
            title="Équilibrages tracés"
            text="Les mouvements entre branches sont enregistrés et vérifiables par tous."
          />
          <FeatureCard
            icon={<Receipt className="h-5 w-5 text-indigo-300" />}
            title="Reçus archivés"
            text="Chaque cotisation génère un reçu conservé et consultable à tout moment."
          />
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-white/90"
          >
            Accéder à mon espace
          </Link>
        </div>
      </section>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-md">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{text}</p>
    </div>
  )
}

export default LandingPage
