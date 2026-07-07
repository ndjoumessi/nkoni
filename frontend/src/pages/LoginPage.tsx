import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Lock, Mail } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { cheminApresConnexion } from '@/lib/roles'
import { focusPremierChampInvalide } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
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

/**
 * Clé localStorage de l'e-mail mémorisé par « Se souvenir de moi ».
 *
 * SÉCURITÉ — on n'y stocke QUE l'e-mail, jamais le mot de passe (ni ici, ni en
 * sessionStorage, ni dans un state React persistant). Le mot de passe lui-même n'est
 * sauvegardé QUE par le gestionnaire natif du navigateur (« Enregistrer le mot de
 * passe ? » de Chrome), déclenché par la soumission du <form> avec autoComplete —
 * mécanisme totalement indépendant de cette case. Cette checkbox NE déclenche PAS et
 * NE remplace PAS l'enregistrement du mot de passe : elle ne fait que (1) pré-remplir
 * l'e-mail et (2) demander une session plus longue au back (refresh 30 j au lieu de 7 j).
 */
const REMEMBERED_EMAIL_KEY = 'nkoni_remembered_email'

function lireEmailMemorise(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    // localStorage indisponible (mode privé strict, quota) → on ignore silencieusement.
    return ''
  }
}

/** Page de connexion NKONI — direction « Laiton & Jade ». */
export function LoginPage() {
  const { login, isAuthenticated, loading, user } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Pré-remplissage depuis l'e-mail mémorisé au précédent login « Se souvenir de moi ».
  const emailMemorise = lireEmailMemorise()
  const [email, setEmail] = useState(emailMemorise)
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(emailMemorise.length > 0)
  const [error, setError] = useState<string | null>(null)
  const [errEmail, setErrEmail] = useState<string | undefined>(undefined)
  const [errPassword, setErrPassword] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  if (!loading && isAuthenticated) {
    // Redirection selon le rôle : SUPER_ADMIN → console plateforme, sinon tableau de bord.
    return <Navigate to={cheminApresConnexion(user?.role)} replace />
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const eEmail =
      !email.includes('@') || email.trim().length < 3
        ? t('commun.validation.emailInvalide')
        : undefined
    const ePassword = password.length === 0 ? t('login.erreurs.motDePasseRequis') : undefined
    setErrEmail(eEmail)
    setErrPassword(ePassword)
    if (eEmail || ePassword) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }

    setSubmitting(true)
    try {
      const emailNettoye = email.trim()
      const connecte = await login(emailNettoye, password, rememberMe)
      // On ne persiste QUE l'e-mail, et seulement si la case est cochée ; sinon on efface
      // toute trace précédente. Le mot de passe n'est jamais touché ici (cf. commentaire
      // sur REMEMBERED_EMAIL_KEY).
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, emailNettoye)
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY)
        }
      } catch {
        // localStorage indisponible → la mémorisation e-mail est simplement inopérante.
      }
      // Un SUPER_ADMIN atterrit sur la console plateforme, tout autre rôle sur son tableau de bord.
      navigate(cheminApresConnexion(connecte.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('login.erreurs.identifiants'))
      } else if (err instanceof ApiError && err.status === 403) {
        setError(t('login.erreurs.compteDesactive'))
      } else {
        setError(t('commun.erreurGenerique'))
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
          <p className="mt-1.5 text-sm text-muted-foreground">{t('login.sousTitre')}</p>
        </div>

        <Card variant="feature" className="nk-reveal nk-d2 p-7 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-foreground">{t('login.titre')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('login.accroche')}</p>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
                {t('login.emailLabel')}
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
                  placeholder={t('login.emailPlaceholder')}
                  className="pl-10"
                  aria-invalid={errEmail ? true : undefined}
                  aria-describedby={errEmail ? 'email-err' : undefined}
                />
              </div>
              {errEmail && <ErreurChamp id="email-err">{errEmail}</ErreurChamp>}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                {t('login.motDePasseLabel')}
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrPassword(undefined)
                }}
                placeholder="••••••••"
                leftIcon={Lock}
                aria-invalid={errPassword ? true : undefined}
                aria-describedby={errPassword ? 'password-err' : undefined}
              />
              {errPassword && <ErreurChamp id="password-err">{errPassword}</ErreurChamp>}
            </div>

            <label htmlFor="rememberMe" className="flex cursor-pointer items-start gap-3">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-hairline-strong bg-surface-2/70 accent-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
              />
              <span className="select-none">
                <span className="block text-sm font-medium text-foreground/80">
                  {t('login.seSouvenir')}
                </span>
                <span className="mt-0.5 block text-xs text-faint">
                  {t('login.seSouvenirDetail')}
                </span>
              </span>
            </label>

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
                t('login.boutonEnCours')
              ) : (
                <>
                  {t('commun.actions.seConnecter')}
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
            {t('commun.actions.retourAccueil')}
          </Link>
        </div>
      </div>
    </main>
  )
}

export default LoginPage
