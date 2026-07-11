import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cleI18n } from '@/lib/i18n'
import { Navigate } from 'react-router-dom'
import { KeyRound, Mail, Power, ShieldUser, UserPlus } from 'lucide-react'
import type { FormEvent } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  utilisateursApi,
  membresApi,
  ApiError,
  messageErreur,
  type Utilisateur,
  type MembreStatut,
} from '@/lib/api'
import { peutGererUtilisateurs, ROLES } from '@/lib/roles'
import { focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Modal } from '@/components/ui/Modal'
import { FormSection } from '@/components/ui/FormSection'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/**
 * Gestion des comptes utilisateurs (§4.5) — ADMIN uniquement.
 * Liste + création (email, mot de passe temporaire, rôle, membre lié optionnel) +
 * activation/désactivation (soft) et changement de rôle. Feedback par toasts.
 */
export function UtilisateursPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[] | null>(null)
  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulaire de création.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('SECRETAIRE')
  const [membreId, setMembreId] = useState('')
  const [creating, setCreating] = useState(false)
  const [creerOuvert, setCreerOuvert] = useState(false)
  // Erreurs inline par champ (§8) — même pattern que Login/MonProfil ; toasts réservés au succès.
  const [erreursCreation, setErreursCreation] = useState<{ email?: string; password?: string }>({})
  const creerFormRef = useRef<HTMLFormElement>(null)

  const [pendingId, setPendingId] = useState<string | null>(null)
  // Changement de rôle À CONFIRMER (M8) : le select ne l'applique plus directement au onChange.
  const [roleChange, setRoleChange] = useState<{ utilisateur: Utilisateur; role: string } | null>(null)

  // Modal de réinitialisation du mot de passe d'un compte (ADMIN).
  const [resetCible, setResetCible] = useState<Utilisateur | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [erreurReset, setErreurReset] = useState<string | undefined>(undefined)
  const resetFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        // Les membres alimentent le select « membre lié » ; best-effort (non bloquant).
        const [us, ms] = await Promise.all([
          utilisateursApi.list(accessToken, signal),
          membresApi.listStatuts(accessToken, signal).catch(() => [] as MembreStatut[]),
        ])
        if (!active) return
        setUtilisateurs(us)
        setMembres(ms)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken])

  // Membres déjà rattachés à un compte → exclus du select (évite un 409 côté backend).
  const membresLibres = useMemo(() => {
    const pris = new Set(
      (utilisateurs ?? []).map((u) => u.membre?.id).filter((v): v is string => Boolean(v)),
    )
    return membres
      .filter((m) => !pris.has(m.id))
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
  }, [membres, utilisateurs])

  if (!peutGererUtilisateurs(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    // Validation inline par champ + focus sur le 1er en erreur (§8) — plus de toast d'erreur de saisie.
    const eEmail = !email.includes('@') ? t('utilisateurs.toast.emailInvalideDetail') : undefined
    const ePassword = password.length < 8 ? t('utilisateurs.min8') : undefined
    if (eEmail || ePassword) {
      setErreursCreation({ email: eEmail, password: ePassword })
      requestAnimationFrame(() => focusPremierChampInvalide(creerFormRef.current))
      return
    }
    setCreating(true)
    try {
      const cree = await utilisateursApi.create(
        { email: email.trim(), password, role, ...(membreId ? { membreId } : {}) },
        accessToken,
      )
      setUtilisateurs((prev) => (prev ? [cree, ...prev] : [cree]))
      setEmail('')
      setPassword('')
      setRole('SECRETAIRE')
      setMembreId('')
      setCreerOuvert(false)
      toast.success(t('utilisateurs.toast.compteCree'), cree.email)
    } catch (err) {
      toast.error(
        t('utilisateurs.toast.creationImpossible'),
        err instanceof ApiError ? err.message : t('utilisateurs.toast.reessayer'),
      )
    } finally {
      setCreating(false)
    }
  }

  const ouvrirReset = (u: Utilisateur) => {
    setResetCible(u)
    setResetPassword('')
    setErreurReset(undefined)
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !resetCible) return
    // Validation inline (§8) — le toast ne sert plus qu'au succès.
    if (resetPassword.length < 8) {
      setErreurReset(t('utilisateurs.min8'))
      requestAnimationFrame(() => focusPremierChampInvalide(resetFormRef.current))
      return
    }
    setResetting(true)
    try {
      await utilisateursApi.reinitialiserMotDePasse(resetCible.id, resetPassword, accessToken)
      toast.success(t('utilisateurs.toast.mdpReinitialise'), resetCible.email)
      setResetCible(null)
      setResetPassword('')
    } catch (err) {
      toast.error(
        t('utilisateurs.toast.reinitImpossible'),
        err instanceof ApiError ? err.message : t('utilisateurs.toast.reessayer'),
      )
    } finally {
      setResetting(false)
    }
  }

  const patch = async (u: Utilisateur, body: { role?: string; actif?: boolean }) => {
    if (!accessToken) return
    setPendingId(u.id)
    try {
      const maj = await utilisateursApi.update(u.id, body, accessToken)
      setUtilisateurs((prev) => (prev ? prev.map((x) => (x.id === u.id ? maj : x)) : prev))
      toast.success(
        body.actif === false
          ? t('utilisateurs.toast.compteDesactive')
          : body.actif === true
            ? t('utilisateurs.toast.compteReactive')
            : t('utilisateurs.toast.compteMaj'),
        maj.email,
      )
    } catch (err) {
      toast.error(
        t('utilisateurs.toast.majImpossible'),
        err instanceof ApiError ? err.message : t('utilisateurs.toast.reessayer'),
      )
    } finally {
      setPendingId(null)
    }
  }

  // Applique le rôle APRÈS confirmation dans la Modal (M8) — jamais au onChange du select.
  const confirmerChangementRole = async () => {
    if (!roleChange) return
    await patch(roleChange.utilisateur, { role: roleChange.role })
    setRoleChange(null)
  }

  const colonnesComptes: Column<Utilisateur>[] = [
    {
      key: 'compte',
      header: t('utilisateurs.table.compte'),
      cell: (u) => {
        const estSoi = u.id === user?.id
        const initiales = (
          u.membre ? `${u.membre.prenom?.[0] ?? ''}${u.membre.nom?.[0] ?? ''}` : u.email.slice(0, 2)
        ).toUpperCase()
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-muted-foreground"
              aria-hidden="true"
            >
              {initiales}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <span className="truncate">{u.email}</span>
                {estSoi && (
                  <Badge tone="brass" size="sm">
                    {t('utilisateurs.table.vous')}
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {u.membre
                  ? t('utilisateurs.table.membre', { nom: u.membre.nom, prenom: u.membre.prenom })
                  : t('utilisateurs.table.aucunMembre')}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'role',
      header: t('utilisateurs.table.role'),
      width: '13rem',
      cell: (u) => {
        const estSoi = u.id === user?.id
        const busy = pendingId === u.id
        return (
          <Select
            value={u.role}
            disabled={estSoi || busy}
            // Ne PAS appliquer directement (une molette suffirait à promouvoir un compte) :
            // on demande confirmation ; le select étant contrôlé par u.role, il revient
            // de lui-même à l'ancienne valeur tant que le patch n'est pas confirmé.
            onChange={(e) => setRoleChange({ utilisateur: u, role: e.target.value })}
            aria-label={t('utilisateurs.table.roleAria', { email: u.email })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`utilisateurs.roles.${r}`)}
              </option>
            ))}
          </Select>
        )
      },
    },
    {
      key: 'statut',
      header: t('utilisateurs.table.statut'),
      cell: (u) =>
        u.actif ? (
          <Badge tone="jade" size="sm" dot>
            {t('utilisateurs.table.actif')}
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            {t('utilisateurs.table.desactive')}
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('utilisateurs.table.actions')}</span>,
      align: 'right',
      cell: (u) => {
        const estSoi = u.id === user?.id
        const busy = pendingId === u.id
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" icon={KeyRound} disabled={busy} onClick={() => ouvrirReset(u)}>
              {t('utilisateurs.table.reinitialiser')}
            </Button>
            <Button
              variant={u.actif ? 'danger' : 'jade'}
              size="sm"
              icon={Power}
              loading={busy}
              disabled={estSoi}
              title={estSoi ? t('utilisateurs.table.soiTitle') : undefined}
              onClick={() => patch(u, { actif: !u.actif })}
            >
              {u.actif ? t('utilisateurs.table.desactiver') : t('utilisateurs.table.reactiver')}
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        overline={t('utilisateurs.header.overline')}
        title={t('utilisateurs.header.titre')}
        description={
          utilisateurs
            ? t('utilisateurs.header.comptes', { count: utilisateurs.length })
            : undefined
        }
        actions={
          <Button
            icon={UserPlus}
            onClick={() => {
              setErreursCreation({})
              setCreerOuvert(true)
            }}
          >
            {t('utilisateurs.creer.titre')}
          </Button>
        }
      />

      {/* Liste des comptes */}
      <div className="nk-reveal nk-d2 mt-7">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={5} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && utilisateurs && utilisateurs.length === 0 && (
          <EmptyState
            icon={ShieldUser}
            title={t('utilisateurs.vide.titre')}
            className="min-h-[40vh] justify-center"
            description={t('utilisateurs.vide.description')}
            tips={[
              { icon: UserPlus, label: t('utilisateurs.vide.tip1') },
              { icon: KeyRound, label: t('utilisateurs.vide.tip2') },
            ]}
          />
        )}

        {!loading && !error && utilisateurs && utilisateurs.length > 0 && (
          <Card className="overflow-hidden p-0">
            <DataTable
              caption={t('utilisateurs.table.caption')}
              columns={colonnesComptes}
              rows={utilisateurs}
              rowKey={(u) => u.id}
            />
          </Card>
        )}
      </div>

      {/* Modal — création d'un compte (liste d'abord : le formulaire s'ouvre à la demande). */}
      <Modal
        open={creerOuvert}
        onClose={() => (creating ? undefined : setCreerOuvert(false))}
        title={t('utilisateurs.creer.titre')}
      >
        <form ref={creerFormRef} onSubmit={handleCreate} className="space-y-4">
          <FormSection icon={Mail} title={t('utilisateurs.creer.identifiants')}>
            <Field label={t('utilisateurs.creer.email')} required error={erreursCreation.email}>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                  aria-hidden="true"
                />
                <Input
                  type="email"
                  name="account-email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    // Efface l'erreur du champ dès la saisie (comme Login).
                    setErreursCreation((er) => (er.email ? { ...er, email: undefined } : er))
                  }}
                  placeholder={t('utilisateurs.creer.emailPlaceholder')}
                  className="pl-10"
                />
              </div>
            </Field>
            <Field
              label={t('utilisateurs.creer.motDePasse')}
              required
              hint={t('utilisateurs.min8')}
              error={erreursCreation.password}
            >
              <PasswordInput
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErreursCreation((er) => (er.password ? { ...er, password: undefined } : er))
                }}
                placeholder="••••••••"
                leftIcon={KeyRound}
              />
            </Field>
          </FormSection>

          <FormSection icon={ShieldUser} title={t('utilisateurs.creer.roleRattachement')}>
            <Field label={t('utilisateurs.creer.role')} required>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`utilisateurs.roles.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('utilisateurs.creer.membreLie')} hint={t('utilisateurs.creer.membreLieHint')}>
              <Select value={membreId} onChange={(e) => setMembreId(e.target.value)}>
                <option value="">{t('utilisateurs.creer.aucun')}</option>
                {membresLibres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom} {m.prenom}
                  </option>
                ))}
              </Select>
            </Field>
          </FormSection>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={creating}
              onClick={() => setCreerOuvert(false)}
            >
              {t('utilisateurs.reset.annuler')}
            </Button>
            <Button type="submit" icon={UserPlus} loading={creating}>
              {t('utilisateurs.creer.bouton')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal — réinitialisation du mot de passe d'un compte (ADMIN, sans l'ancien) */}
      <Modal
        open={resetCible !== null}
        onClose={() => (resetting ? undefined : setResetCible(null))}
        title={t('utilisateurs.reset.titre')}
      >
        <form ref={resetFormRef} onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('utilisateurs.reset.intro')}{' '}
            <span className="font-medium text-foreground">{resetCible?.email}</span>
            {t('utilisateurs.reset.introSuite')}
          </p>
          <Field
            label={t('utilisateurs.reset.nouveau')}
            required
            hint={t('utilisateurs.min8')}
            error={erreurReset}
          >
            <PasswordInput
              name="reset-new-password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(e) => {
                setResetPassword(e.target.value)
                setErreurReset(undefined)
              }}
              placeholder="••••••••"
              leftIcon={KeyRound}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={resetting}
              onClick={() => setResetCible(null)}
            >
              {t('utilisateurs.reset.annuler')}
            </Button>
            <Button type="submit" icon={KeyRound} loading={resetting}>
              {t('utilisateurs.reset.bouton')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal — confirmation de changement de rôle (M8) : évite la promotion accidentelle
          (molette/flèches sur le select). Annuler → le select contrôlé revient à u.role. */}
      <Modal
        open={roleChange !== null}
        onClose={() => (pendingId ? undefined : setRoleChange(null))}
        title={t('utilisateurs.roleModal.titre')}
      >
        {roleChange && (
          <>
            <p className="text-sm text-muted-foreground">
              {t('utilisateurs.roleModal.texte', {
                compte: roleChange.utilisateur.email,
                role: t(cleI18n(`utilisateurs.roles.${roleChange.role}`)),
              })}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pendingId === roleChange.utilisateur.id}
                onClick={() => setRoleChange(null)}
              >
                {t('utilisateurs.roleModal.annuler')}
              </Button>
              <Button
                type="button"
                icon={ShieldUser}
                loading={pendingId === roleChange.utilisateur.id}
                onClick={() => void confirmerChangementRole()}
              >
                {t('utilisateurs.roleModal.confirmer')}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default UtilisateursPage
