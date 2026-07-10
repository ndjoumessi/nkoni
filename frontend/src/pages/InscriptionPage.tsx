import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
import { LangueToggle } from '@/components/ui/LangueToggle'

/** Message d'erreur inline sous un champ (parité §8 avec la primitive Field). */
function ErreurChamp({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" className="mt-1.5 flex items-start gap-1 text-xs text-terra">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

// Libellés résolus à l'affichage (§4 i18n) : les tableaux ne portent que valeur + clé de trad.
const DEVISES: { value: InscriptionInput['devise']; labelKey: string }[] = [
  { value: 'FCFA', labelKey: 'inscription.devises.fcfa' },
  { value: 'EUR', labelKey: 'inscription.devises.eur' },
  { value: 'USD', labelKey: 'inscription.devises.usd' },
  { value: 'CAD', labelKey: 'inscription.devises.cad' },
]
const LANGUES: { value: InscriptionInput['langue']; labelKey: string }[] = [
  { value: 'FR', labelKey: 'commun.langue.fr' },
  { value: 'EN', labelKey: 'commun.langue.en' },
]

/**
 * Auto-inscription (§3.1) — « Créer mon espace ». Crée l'organisation + le compte ADMIN
 * fondateur puis connecte directement (le back émet la session) → redirection dashboard.
 * Devise et langue sont fixées ici et IMMUABLES ensuite (§5).
 */
export function InscriptionPage() {
  const { inscription, isAuthenticated, loading } = useAuth()
  const { t } = useTranslation()
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
      nomOrganisation.trim().length === 0 ? t('inscription.erreurs.nomRequis') : undefined
    const eEmail =
      !email.includes('@') || email.trim().length < 3
        ? t('commun.validation.emailInvalide')
        : undefined
    const ePassword =
      password.length < 8 ? t('inscription.erreurs.motDePasseCourt') : undefined
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
        setError(t('inscription.erreurs.conflit'))
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('inscription.erreurs.invalide'))
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

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <LangueToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="nk-reveal nk-d1 mb-8 flex flex-col items-center text-center">
          <NkoniMark className="h-12 w-12 text-2xl" />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-foreground">
            NKONI
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('inscription.sousTitre')}</p>
        </div>

        <Card variant="feature" className="nk-reveal nk-d2 p-6 sm:p-7">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {t('commun.actions.creerMonEspace')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('inscription.accroche')}</p>

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="nomOrganisation"
                className="mb-1.5 block text-sm font-medium text-foreground/80"
              >
                {t('inscription.nomLabel')}
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
                  placeholder={t('inscription.nomPlaceholder')}
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
                  {t('inscription.deviseLabel')}
                </label>
                <Select
                  id="devise"
                  name="devise"
                  value={devise}
                  onChange={(e) => setDevise(e.target.value as InscriptionInput['devise'])}
                >
                  {DEVISES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {t(d.labelKey)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="langue" className="mb-1.5 block text-sm font-medium text-foreground/80">
                  {t('inscription.langueLabel')}
                </label>
                <Select
                  id="langue"
                  name="langue"
                  value={langue}
                  onChange={(e) => setLangue(e.target.value as InscriptionInput['langue'])}
                >
                  {LANGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {t(l.labelKey)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-xs text-faint">{t('inscription.immuable')}</p>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
                {t('inscription.emailLabel')}
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
                  placeholder={t('inscription.emailPlaceholder')}
                  className="pl-10"
                  aria-invalid={errEmail ? true : undefined}
                  aria-describedby={errEmail ? 'email-err' : undefined}
                />
              </div>
              {errEmail && <ErreurChamp id="email-err">{errEmail}</ErreurChamp>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground/80">
                {t('inscription.motDePasseLabel')}
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
                  {t('inscription.motDePasseIndice')}
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
                t('inscription.boutonEnCours')
              ) : (
                <>
                  {t('commun.actions.creerMonEspace')}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t('inscription.dejaEspace')}{' '}
            <Link to="/login" className="font-medium text-brass transition-colors hover:text-amber">
              {t('commun.actions.seConnecter')}
            </Link>
          </p>
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

export default InscriptionPage
