import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Building2, Lock, Mail } from 'lucide-react'
import { ApiError } from '@/lib/api'
import type { InscriptionInput } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Card } from '@/components/ui/Card'
import { NkoniMark } from '@/components/ui/NkoniMark'

/** Message d'erreur inline sous un champ (parité §8 avec la primitive Field). */
function ErreurChamp({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" className="mt-1.5 flex items-start gap-1 text-xs text-terra">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

const DEVISES: { value: InscriptionInput['devise']; label: string }[] = [
  { value: 'FCFA', label: 'FCFA (Franc CFA)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'USD', label: 'USD (Dollar US)' },
  { value: 'CAD', label: 'CAD (Dollar canadien)' },
]
const LANGUES: { value: InscriptionInput['langue']; label: string }[] = [
  { value: 'FR', label: 'Français' },
  { value: 'EN', label: 'English' },
]

/**
 * Auto-inscription (§3.1) — « Créer mon espace ». Crée l'organisation + le compte ADMIN
 * fondateur puis connecte directement (le back émet la session) → redirection dashboard.
 * Devise et langue sont fixées ici et IMMUABLES ensuite (§5).
 */
export function InscriptionPage() {
  const { inscription, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  const [nomOrganisation, setNomOrganisation] = useState('')
  const [devise, setDevise] = useState<InscriptionInput['devise']>('FCFA')
  const [langue, setLangue] = useState<InscriptionInput['langue']>('FR')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errNom, setErrNom] = useState<string | undefined>(undefined)
  const [errEmail, setErrEmail] = useState<string | undefined>(undefined)
  const [errPassword, setErrPassword] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const eNom =
      nomOrganisation.trim().length === 0
        ? 'Veuillez saisir le nom de votre organisation.'
        : undefined
    const eEmail =
      !email.includes('@') || email.trim().length < 3
        ? 'Veuillez saisir une adresse e-mail valide.'
        : undefined
    const ePassword =
      password.length < 8 ? 'Le mot de passe doit contenir au moins 8 caractères.' : undefined
    setErrNom(eNom)
    setErrEmail(eEmail)
    setErrPassword(ePassword)
    if (eNom || eEmail || ePassword) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }

    setSubmitting(true)
    try {
      await inscription({
        nomOrganisation: nomOrganisation.trim(),
        devise,
        langue,
        email: email.trim(),
        password,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // 409 : email déjà utilisé — message GÉNÉRIQUE (ne pas révéler l'existence d'un compte).
      if (err instanceof ApiError && err.status === 409) {
        setError('Impossible de créer cet espace avec ces informations.')
      } else if (err instanceof ApiError && err.status === 400) {
        setError('Certaines informations sont invalides. Vérifiez le formulaire.')
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
            Créez l'espace sécurisé de votre communauté
          </p>
        </div>

        <Card variant="feature" className="nk-reveal nk-d2 p-7 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-foreground">Créer mon espace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quelques informations pour démarrer. Vous en serez l'administrateur.
          </p>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="nomOrganisation"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                Nom de l'organisation
              </label>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                  aria-hidden="true"
                />
                <Input
                  id="nomOrganisation"
                  name="nomOrganisation"
                  type="text"
                  autoComplete="organization"
                  value={nomOrganisation}
                  onChange={(e) => {
                    setNomOrganisation(e.target.value)
                    setErrNom(undefined)
                  }}
                  placeholder="Famille Wamba Tchoupa, Amicale…"
                  className="pl-10"
                  aria-invalid={errNom ? true : undefined}
                  aria-describedby={errNom ? 'nom-err' : undefined}
                />
              </div>
              {errNom && <ErreurChamp id="nom-err">{errNom}</ErreurChamp>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="devise" className="mb-1.5 block text-sm font-medium text-foreground/80">
                  Devise
                </label>
                <Select
                  id="devise"
                  name="devise"
                  value={devise}
                  onChange={(e) => setDevise(e.target.value as InscriptionInput['devise'])}
                >
                  {DEVISES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="langue" className="mb-1.5 block text-sm font-medium text-foreground/80">
                  Langue
                </label>
                <Select
                  id="langue"
                  name="langue"
                  value={langue}
                  onChange={(e) => setLangue(e.target.value as InscriptionInput['langue'])}
                >
                  {LANGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-xs text-faint">La devise et la langue sont définitives après création.</p>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
                Adresse e-mail (administrateur)
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
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setErrEmail(undefined)
                  }}
                  placeholder="vous@exemple.com"
                  className="pl-10"
                  aria-invalid={errEmail ? true : undefined}
                  aria-describedby={errEmail ? 'email-err' : undefined}
                />
              </div>
              {errEmail && <ErreurChamp id="email-err">{errEmail}</ErreurChamp>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground/80">
                Mot de passe
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrPassword(undefined)
                }}
                placeholder="••••••••"
                leftIcon={Lock}
                aria-invalid={errPassword ? true : undefined}
                aria-describedby={errPassword ? 'password-err' : 'password-hint'}
              />
              {errPassword ? (
                <ErreurChamp id="password-err">{errPassword}</ErreurChamp>
              ) : (
                <span id="password-hint" className="mt-1.5 block text-xs text-faint">
                  8 caractères minimum.
                </span>
              )}
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
                'Création…'
              ) : (
                <>
                  Créer mon espace
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Vous avez déjà un espace ?{' '}
            <Link to="/login" className="font-medium text-brass transition-colors hover:text-amber">
              Se connecter
            </Link>
          </p>
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

export default InscriptionPage
