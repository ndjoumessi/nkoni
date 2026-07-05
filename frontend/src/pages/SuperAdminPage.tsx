import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, LogOut, PauseCircle, PlayCircle, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  platformApi,
  ApiError,
  messageErreur,
  type PlatformOrganisation,
} from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { NkoniMark } from '@/components/ui/NkoniMark'

/** Format court d'une date de création (ex. « 4 juil. 2026 »). */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Console PLATEFORME (SaaS §2.3) — réservée au SUPER_ADMIN (garde SuperAdminRoute).
 *
 * Layout AUTONOME (pas l'AppShell tenant, sans rapport avec une organisation) : gestion des
 * organisations clientes. On peut suspendre (bloque l'accès, AUCUNE donnée supprimée) ou
 * réactiver un espace. Aucune donnée métier n'est exposée : uniquement statut, date et volume.
 */
export function SuperAdminPage() {
  const { user, accessToken, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [organisations, setOrganisations] = useState<PlatformOrganisation[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Organisation en attente de confirmation de suspension (ouvre la modale).
  const [cibleSuspension, setCibleSuspension] = useState<PlatformOrganisation | null>(null)
  const [suspending, setSuspending] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { organisations: orgs } = await platformApi.listOrganisations(accessToken, signal)
        if (active) setOrganisations(orgs)
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

  const resume = useMemo(() => {
    if (!organisations) return undefined
    const total = organisations.length
    const actives = organisations.filter((o) => o.actif).length
    const suspendues = total - actives
    const parts = [`${total} organisation${total > 1 ? 's' : ''}`, `${actives} active${actives > 1 ? 's' : ''}`]
    if (suspendues > 0) parts.push(`${suspendues} suspendue${suspendues > 1 ? 's' : ''}`)
    return parts.join(' · ')
  }, [organisations])

  /** Met à jour une organisation dans la liste après une mutation de statut. */
  const appliquerStatut = (id: string, actif: boolean) => {
    setOrganisations((prev) => (prev ? prev.map((o) => (o.id === id ? { ...o, actif } : o)) : prev))
  }

  const confirmerSuspension = async () => {
    if (!accessToken || !cibleSuspension) return
    const cible = cibleSuspension
    setSuspending(true)
    try {
      await platformApi.suspendre(cible.id, accessToken)
      appliquerStatut(cible.id, false)
      toast.success('Organisation suspendue', cible.nom)
      setCibleSuspension(null)
    } catch (err) {
      toast.error(
        'Suspension impossible',
        err instanceof ApiError ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setSuspending(false)
    }
  }

  const reactiver = async (org: PlatformOrganisation) => {
    if (!accessToken) return
    setPendingId(org.id)
    try {
      await platformApi.reactiver(org.id, accessToken)
      appliquerStatut(org.id, true)
      toast.success('Organisation réactivée', org.nom)
    } catch (err) {
      toast.error(
        'Réactivation impossible',
        err instanceof ApiError ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const colonnes: Column<PlatformOrganisation>[] = [
    {
      key: 'organisation',
      header: 'Organisation',
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{o.nom}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">
            {o.devise} · {o.langueDefaut} · {o.id.slice(0, 8)}…
          </p>
        </div>
      ),
    },
    {
      key: 'membres',
      header: 'Membres',
      width: '7rem',
      cell: (o) => <span className="tabular-nums text-muted-foreground">{o.nbMembres}</span>,
    },
    {
      key: 'creee',
      header: 'Créée le',
      width: '10rem',
      cell: (o) => <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>,
    },
    {
      key: 'statut',
      header: 'Statut',
      width: '9rem',
      cell: (o) =>
        o.actif ? (
          <Badge tone="jade" size="sm" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Suspendue
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (o) => {
        const busy = pendingId === o.id
        return o.actif ? (
          <Button
            variant="danger"
            size="sm"
            icon={PauseCircle}
            disabled={busy}
            onClick={() => setCibleSuspension(o)}
          >
            Suspendre
          </Button>
        ) : (
          <Button
            variant="jade"
            size="sm"
            icon={PlayCircle}
            loading={busy}
            onClick={() => reactiver(o)}
          >
            Réactiver
          </Button>
        )
      },
    },
  ]

  return (
    <main className="min-h-screen bg-background">
      {/* Barre de plateforme — autonome, sans navigation tenant. */}
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <NkoniMark className="h-8 w-8 text-lg" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              NKONI
            </span>
            <Badge tone="brass" size="sm">
              Plateforme
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={handleLogout}>
              Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader overline="Plateforme" title="Organisations" description={resume} />

        <div className="nk-reveal nk-d2 mt-7">
          {loading && (
            <Card className="overflow-hidden p-0">
              <RowsSkeleton rows={5} />
            </Card>
          )}

          {!loading && error && (
            <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
          )}

          {!loading && !error && organisations && organisations.length === 0 && (
            <EmptyState
              icon={Building2}
              title="Aucune organisation"
              className="min-h-[40vh] justify-center"
              description="Aucun espace client n'a encore été créé via l'auto-inscription."
            />
          )}

          {!loading && !error && organisations && organisations.length > 0 && (
            <Card className="overflow-hidden p-0">
              <DataTable
                caption="Organisations clientes"
                columns={colonnes}
                rows={organisations}
                rowKey={(o) => o.id}
              />
            </Card>
          )}
        </div>
      </div>

      {/* Confirmation de suspension — action à conséquence (bloque tout un espace). */}
      <Modal
        open={cibleSuspension !== null}
        onClose={() => (suspending ? undefined : setCibleSuspension(null))}
        title="Suspendre l'organisation"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/[0.08] px-3.5 py-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Les utilisateurs de{' '}
              <span className="font-medium text-foreground">{cibleSuspension?.nom}</span> ne
              pourront plus se connecter. <span className="text-foreground">Aucune donnée n'est
              supprimée</span> — vous pourrez réactiver l'espace à tout moment.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={suspending}
              onClick={() => setCibleSuspension(null)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              icon={PauseCircle}
              loading={suspending}
              onClick={confirmerSuspension}
            >
              Suspendre l'accès
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  )
}

export default SuperAdminPage
