import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * Placeholder — la page de connexion sera implémentée ultérieurement.
 */
export function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0b0b12] px-6 text-center text-white">
      <div className="rounded-3xl border border-white/12 bg-white/[0.06] p-10 backdrop-blur-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="mt-3 max-w-sm text-sm text-white/55">
          La page de connexion NKONI arrive bientôt.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à l'accueil
        </Link>
      </div>
    </main>
  )
}

export default LoginPage
