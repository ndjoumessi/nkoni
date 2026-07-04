import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

/**
 * Page de connexion NKONI — thème glassmorphism (fond dégradé, carte translucide).
 */
export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Déjà connecté (ou session restaurée) → on va directement au dashboard.
  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Validation basique.
    if (!email.includes('@') || email.trim().length < 3) {
      setError('Veuillez saisir une adresse e-mail valide.')
      return
    }
    if (password.length === 0) {
      setError('Veuillez saisir votre mot de passe.')
      return
    }

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Identifiants invalides.')
      } else if (err instanceof ApiError && err.status === 403) {
        setError('Ce compte est désactivé.')
      } else {
        setError('Une erreur est survenue. Réessayez plus tard.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0b12] px-6 py-12 text-white">
      {/* Fond dégradé (pas d'image externe) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(900px 500px at 20% -10%, rgba(129,140,248,0.28), transparent 60%),' +
            'radial-gradient(700px 500px at 100% 10%, rgba(56,189,248,0.18), transparent 58%),' +
            'linear-gradient(180deg, #0b0b12 0%, #0e0f1a 60%, #0b0b12 100%)',
        }}
      />

      <div className="w-full max-w-md">
        {/* En-tête de marque */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
              NKONI
            </span>
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Espace de gestion familiale WAMBA TCHOUPA
          </p>
        </div>

        {/* Carte glassmorphism */}
        <div className="rounded-3xl border border-white/12 bg-white/[0.06] p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          <h2 className="text-lg font-semibold text-white">Connexion</h2>
          <p className="mt-1 text-sm text-white/50">
            Accédez à votre espace membre.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-white/70"
              >
                Adresse e-mail
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-white/70"
              >
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
              >
                {error}
              </p>
            )}

            {/* Bouton */}
            <button
              type="submit"
              disabled={submitting}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Retour accueil */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </main>
  )
}

export default LoginPage
