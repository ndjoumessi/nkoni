import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Lock, Mail } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Card } from '@/components/ui/Card'
import { NkoniMark } from '@/components/ui/NkoniMark'

/** Page de connexion NKONI — direction « Laiton & Jade ». */
export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div className="nk-aura pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="nk-grid absolute inset-0 -z-10" aria-hidden="true" />

      <div className="w-full max-w-md">
        <div className="nk-reveal nk-d1 mb-8 flex flex-col items-center text-center">
          <NkoniMark className="h-12 w-12 text-2xl" />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-foreground">
            NKONI
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Votre espace de gestion associative et familiale
          </p>
        </div>

        <Card variant="feature" className="nk-reveal nk-d2 p-7 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-foreground">Connexion</h2>
          <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace membre.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
                Adresse e-mail
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra"
              >
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting} className="w-full" size="lg">
              {submitting ? (
                'Connexion…'
              ) : (
                <>
                  Se connecter
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
          </form>
        </Card>

        <div className="nk-reveal nk-d3 mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
