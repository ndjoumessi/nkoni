import { useRef, useState, type FormEvent } from 'react'
import { KeyRound, Lock, Mail, ShieldCheck, UserCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { authApi, ApiError } from '@/lib/api'
import { focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { FormSection } from '@/components/ui/FormSection'
import { NotificationPreferences } from '@/components/NotificationPreferences'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrateur',
  PRESIDENT: 'Président',
  SECRETAIRE: 'Secrétaire',
  TRESORIERE: 'Trésorière',
  COMMISSAIRE_COMPTES: 'Commissaire aux comptes',
  GUIDE_RELIGIEUX: 'Guide religieux',
  MEMBRE_SIMPLE: 'Membre',
}

/**
 * « Mon profil » — accessible à tout utilisateur connecté. Permet de changer soi-même
 * son mot de passe (ancien vérifié côté back via POST /auth/changer-mot-de-passe).
 * La réinitialisation SANS ancien mot de passe est réservée à l'ADMIN (UtilisateursPage).
 */
export function MonProfilPage() {
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errAncien, setErrAncien] = useState<string | undefined>(undefined)
  const [errNouveau, setErrNouveau] = useState<string | undefined>(undefined)
  const [errConfirmation, setErrConfirmation] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!accessToken) return

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const eAncien = ancien.length === 0 ? 'Saisissez votre mot de passe actuel.' : undefined
    const eNouveau =
      nouveau.length < 8
        ? 'Au moins 8 caractères.'
        : nouveau === ancien
          ? 'Doit être différent de l’actuel.'
          : undefined
    const eConfirmation =
      !eNouveau && nouveau !== confirmation ? 'La confirmation ne correspond pas.' : undefined
    setErrAncien(eAncien)
    setErrNouveau(eNouveau)
    setErrConfirmation(eConfirmation)
    if (eAncien || eNouveau || eConfirmation) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }

    setSubmitting(true)
    try {
      await authApi.changerMotDePasse(ancien, nouveau, accessToken)
      toast.success('Mot de passe modifié', 'Votre nouveau mot de passe est actif.')
      setAncien('')
      setNouveau('')
      setConfirmation('')
    } catch (err) {
      // 401 = mot de passe actuel incorrect → erreur ciblée sur le champ « actuel ».
      if (err instanceof ApiError && err.status === 401) {
        setErrAncien('Mot de passe actuel incorrect.')
        requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader overline="Compte" title="Mon profil" />

      {/* Identité (lecture seule) */}
      <Card className="nk-reveal nk-d1 mt-7 p-6">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Identité</Overline>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Mail className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
            <dt className="sr-only">Adresse e-mail</dt>
            <dd className="min-w-0 break-words text-foreground">{user?.email}</dd>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-faint" aria-hidden="true" />
            <dt className="sr-only">Rôle</dt>
            <dd className="text-muted-foreground">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Changement de mot de passe */}
      <Card className="nk-reveal nk-d2 mt-6 p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Changer mon mot de passe</Overline>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <FormSection icon={Lock} title="Sécurité">
            <Field label="Mot de passe actuel" required error={errAncien}>
              <PasswordInput
                name="current-password"
                autoComplete="current-password"
                value={ancien}
                onChange={(e) => {
                  setAncien(e.target.value)
                  setErrAncien(undefined)
                }}
                placeholder="••••••••"
                leftIcon={Lock}
              />
            </Field>
            <Field
              label="Nouveau mot de passe"
              required
              hint="Au moins 8 caractères."
              error={errNouveau}
            >
              <PasswordInput
                name="new-password"
                autoComplete="new-password"
                value={nouveau}
                onChange={(e) => {
                  setNouveau(e.target.value)
                  setErrNouveau(undefined)
                }}
                placeholder="••••••••"
                leftIcon={KeyRound}
              />
            </Field>
            <Field label="Confirmer le nouveau mot de passe" required error={errConfirmation}>
              <PasswordInput
                name="confirm-password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => {
                  setConfirmation(e.target.value)
                  setErrConfirmation(undefined)
                }}
                placeholder="••••••••"
                leftIcon={KeyRound}
              />
            </Field>
          </FormSection>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button type="submit" icon={KeyRound} loading={submitting}>
              Mettre à jour le mot de passe
            </Button>
          </div>
        </form>
      </Card>

      {/* Préférences de notification (§5) */}
      <NotificationPreferences />
    </>
  )
}

export default MonProfilPage
