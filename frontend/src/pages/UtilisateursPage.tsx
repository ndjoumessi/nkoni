import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { KeyRound, Mail, Power, ShieldUser, UserPlus } from 'lucide-react'
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
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { FormSection } from '@/components/ui/FormSection'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/**
 * Gestion des comptes utilisateurs (§4.5) — ADMIN uniquement.
 * Liste + création (email, mot de passe temporaire, rôle, membre lié optionnel) +
 * activation/désactivation (soft) et changement de rôle. Feedback par toasts.
 */
export function UtilisateursPage() {
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

  const [pendingId, setPendingId] = useState<string | null>(null)

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
    if (!email.includes('@')) {
      toast.error('Email invalide', 'Saisissez une adresse e-mail valide.')
      return
    }
    if (password.length < 8) {
      toast.error('Mot de passe trop court', 'Au moins 8 caractères.')
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
      toast.success('Compte créé', cree.email)
    } catch (err) {
      toast.error(
        'Création impossible',
        err instanceof ApiError ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setCreating(false)
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
          ? 'Compte désactivé'
          : body.actif === true
            ? 'Compte réactivé'
            : 'Compte mis à jour',
        maj.email,
      )
    } catch (err) {
      toast.error(
        'Mise à jour impossible',
        err instanceof ApiError ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setPendingId(null)
    }
  }

  return (
    <>
      <PageHeader
        overline="Administration"
        title="Utilisateurs"
        description={
          utilisateurs
            ? `${utilisateurs.length} compte${utilisateurs.length > 1 ? 's' : ''}`
            : undefined
        }
      />

      {/* Création d'un compte */}
      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Créer un compte</Overline>
        </div>
        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          {/* Section 1 — Identifiants de connexion */}
          <FormSection icon={Mail} title="Identifiants de connexion">
            <Field label="Adresse e-mail" required>
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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="compte@exemple.com"
                  className="pl-10"
                />
              </div>
            </Field>
            <Field label="Mot de passe temporaire" required hint="Au moins 8 caractères.">
              <PasswordInput
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={KeyRound}
              />
            </Field>
          </FormSection>

          {/* Section 2 — Rôle & rattachement */}
          <FormSection icon={ShieldUser} title="Rôle & rattachement">
            <Field label="Rôle" required>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Membre lié" hint="Optionnel — rattache le compte à une fiche membre.">
              <Select value={membreId} onChange={(e) => setMembreId(e.target.value)}>
                <option value="">Aucun</option>
                {membresLibres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom} {m.prenom}
                  </option>
                ))}
              </Select>
            </Field>
          </FormSection>

          <div className="flex justify-end pt-1">
            <Button type="submit" icon={UserPlus} loading={creating}>
              Créer le compte
            </Button>
          </div>
        </form>
      </Card>

      {/* Liste des comptes */}
      <div className="nk-reveal nk-d3 mt-6">
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
            title="Aucun compte"
            className="min-h-[40vh] justify-center"
            description="Créez le premier compte de connexion ci-dessus."
            tips={[
              { icon: UserPlus, label: 'Secrétaire, trésorière, commissaire…' },
              { icon: KeyRound, label: 'Mot de passe temporaire à changer' },
            ]}
          />
        )}

        {!loading && !error && utilisateurs && utilisateurs.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="hidden grid-cols-[2fr_1.4fr_1.2fr_auto] gap-4 border-b border-hairline px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint md:grid">
              <span>Compte</span>
              <span>Rôle</span>
              <span>Statut</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-hairline">
              {utilisateurs.map((u) => {
                const estSoi = u.id === user?.id
                const busy = pendingId === u.id
                return (
                  <li
                    key={u.id}
                    className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[2fr_1.4fr_1.2fr_auto] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        <span className="truncate">{u.email}</span>
                        {estSoi && (
                          <Badge tone="brass" size="sm">
                            Vous
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {u.membre ? `Membre : ${u.membre.nom} ${u.membre.prenom}` : 'Aucun membre lié'}
                      </p>
                    </div>

                    <Select
                      value={u.role}
                      disabled={estSoi || busy}
                      onChange={(e) => patch(u, { role: e.target.value })}
                      aria-label={`Rôle de ${u.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>

                    <span>
                      {u.actif ? (
                        <Badge tone="jade" size="sm" dot>
                          Actif
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          Désactivé
                        </Badge>
                      )}
                    </span>

                    <div className="flex justify-start md:justify-end">
                      <Button
                        variant={u.actif ? 'danger' : 'jade'}
                        size="sm"
                        icon={Power}
                        loading={busy}
                        disabled={estSoi}
                        title={estSoi ? 'Vous ne pouvez pas désactiver votre propre compte.' : undefined}
                        onClick={() => patch(u, { actif: !u.actif })}
                      >
                        {u.actif ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}

export default UtilisateursPage
