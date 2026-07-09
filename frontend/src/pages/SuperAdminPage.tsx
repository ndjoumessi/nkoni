import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'
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
import { StatCard } from '@/components/ui/StatCard'
import { DataTable, type Column, type SortDir } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { Input } from '@/components/ui/Field'
import { cn, formatDate } from '@/lib/utils'

/** Format long pour l'info-bulle (attribut title). */
const DATE_LONGUE = { day: 'numeric', month: 'long', year: 'numeric' } as const

/** Plafond du forfait gratuit (§5) — base de la visualisation de quota. */
const LIMITE_FORFAIT_GRATUIT = 100

type FiltreStatut = 'tous' | 'actives' | 'suspendues'
type ColonneTri = 'organisation' | 'membres' | 'creee' | 'statut'

/** Date relative « il y a 3 j » selon la langue courante (Intl.RelativeTimeFormat). */
function tempsRelatif(iso: string, langue: string): string {
  const secondes = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const abs = Math.abs(secondes)
  const rtf = new Intl.RelativeTimeFormat(langue.startsWith('en') ? 'en' : 'fr', {
    numeric: 'auto',
    style: 'short',
  })
  const paliers: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unite, taille] of paliers) {
    if (abs >= taille) return rtf.format(Math.round(secondes / taille), unite)
  }
  return rtf.format(0, 'day')
}

/**
 * Barre de quota membres / plafond du forfait. Teinte jade (sain), or (≥ 80 %),
 * terra (plafond atteint). `progressbar` accessible.
 */
function QuotaMembres({
  n,
  max,
  ariaLabel,
  titre,
}: {
  n: number
  max: number
  ariaLabel: string
  titre?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((n / max) * 100)) : 0
  const atteint = n >= max
  const proche = !atteint && pct >= 80
  const barre = atteint ? 'bg-terra' : proche ? 'bg-amber' : 'bg-jade'
  const compteur = atteint ? 'text-terra' : proche ? 'text-amber' : 'text-foreground'
  return (
    <div className="w-full" title={titre}>
      <div className="flex items-baseline justify-end gap-1">
        <span className={cn('num text-sm font-medium', compteur)}>{n}</span>
        <span className="text-xs text-faint">/ {max}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={n}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={ariaLabel}
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', barre)}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Console PLATEFORME (SaaS §2.3) — réservée au SUPER_ADMIN (garde SuperAdminRoute).
 *
 * Layout AUTONOME (pas l'AppShell tenant, sans rapport avec une organisation) : gestion des
 * organisations clientes. Bandeau de KPIs, recherche + filtre par statut, tri des colonnes et
 * visualisation du quota du forfait. On peut suspendre (bloque l'accès, AUCUNE donnée
 * supprimée) ou réactiver un espace. Aucune donnée métier n'est exposée : uniquement statut,
 * date, devise, langue et volume de membres.
 */
export function SuperAdminPage() {
  const { t, i18n } = useTranslation()
  const { user, accessToken, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [organisations, setOrganisations] = useState<PlatformOrganisation[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Filtres & tri (client : toutes les données sont chargées → fiable, pas seulement une page).
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous')
  const [tri, setTri] = useState<{ col: ColonneTri; dir: SortDir }>({ col: 'creee', dir: 'desc' })

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

  // KPIs plateforme (sur l'ensemble non filtré).
  const kpis = useMemo(() => {
    const liste = organisations ?? []
    const total = liste.length
    const actives = liste.filter((o) => o.actif).length
    return {
      total,
      actives,
      suspendues: total - actives,
      membres: liste.reduce((somme, o) => somme + o.nbMembres, 0),
    }
  }, [organisations])

  // Filtrage (recherche par nom + statut).
  const filtrees = useMemo(() => {
    if (!organisations) return []
    const q = recherche.trim().toLowerCase()
    return organisations.filter((o) => {
      if (q && !o.nom.toLowerCase().includes(q)) return false
      if (filtreStatut === 'actives' && !o.actif) return false
      if (filtreStatut === 'suspendues' && o.actif) return false
      return true
    })
  }, [organisations, recherche, filtreStatut])

  // Tri client.
  const triees = useMemo(() => {
    const cmp = (a: PlatformOrganisation, b: PlatformOrganisation): number => {
      switch (tri.col) {
        case 'membres':
          return a.nbMembres - b.nbMembres
        case 'creee':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'statut':
          return Number(a.actif) - Number(b.actif)
        default:
          return a.nom.localeCompare(b.nom)
      }
    }
    const arr = [...filtrees].sort(cmp)
    return tri.dir === 'desc' ? arr.reverse() : arr
  }, [filtrees, tri])

  const trierPar = (col: string) =>
    setTri((prev) =>
      prev.col === col
        ? { col: prev.col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col: col as ColonneTri, dir: 'asc' },
    )

  const resetFiltres = () => {
    setRecherche('')
    setFiltreStatut('tous')
  }

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
      toast.success(t('superAdmin.toast.suspendue'), cible.nom)
      setCibleSuspension(null)
    } catch (err) {
      toast.error(
        t('superAdmin.toast.suspensionImpossible'),
        err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'),
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
      toast.success(t('superAdmin.toast.reactivee'), org.nom)
    } catch (err) {
      toast.error(
        t('superAdmin.toast.reactivationImpossible'),
        err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'),
      )
    } finally {
      setPendingId(null)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // Segments du filtre par statut (avec compteurs).
  const segments: { cle: FiltreStatut; libelle: string; compte: number }[] = [
    { cle: 'tous', libelle: t('superAdmin.filtres.statutTous'), compte: kpis.total },
    { cle: 'actives', libelle: t('superAdmin.filtres.statutActives'), compte: kpis.actives },
    { cle: 'suspendues', libelle: t('superAdmin.filtres.statutSuspendues'), compte: kpis.suspendues },
  ]

  const colonnes: Column<PlatformOrganisation>[] = [
    {
      key: 'organisation',
      header: t('superAdmin.table.organisation'),
      sortable: true,
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
      header: t('superAdmin.table.membres'),
      width: '11rem',
      numeric: true,
      sortable: true,
      cell: (o) => (
        <QuotaMembres
          n={o.nbMembres}
          max={LIMITE_FORFAIT_GRATUIT}
          ariaLabel={t('superAdmin.table.quotaAria', { n: o.nbMembres, max: LIMITE_FORFAIT_GRATUIT })}
          titre={
            o.nbMembres >= LIMITE_FORFAIT_GRATUIT
              ? t('superAdmin.table.quotaAtteint')
              : o.nbMembres / LIMITE_FORFAIT_GRATUIT >= 0.8
                ? t('superAdmin.table.quotaProche')
                : undefined
          }
        />
      ),
    },
    {
      key: 'creee',
      header: t('superAdmin.table.creeeLe'),
      width: '9rem',
      sortable: true,
      cell: (o) => (
        <span className="text-muted-foreground" title={formatDate(o.createdAt, DATE_LONGUE)}>
          {tempsRelatif(o.createdAt, i18n.language)}
        </span>
      ),
    },
    {
      key: 'statut',
      header: t('superAdmin.table.statut'),
      width: '9rem',
      sortable: true,
      cell: (o) =>
        o.actif ? (
          <Badge tone="jade" size="sm" dot>
            {t('superAdmin.table.active')}
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            {t('superAdmin.table.suspendue')}
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('superAdmin.table.actions')}</span>,
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
            {t('superAdmin.table.suspendre')}
          </Button>
        ) : (
          <Button
            variant="jade"
            size="sm"
            icon={PlayCircle}
            loading={busy}
            onClick={() => reactiver(o)}
          >
            {t('superAdmin.table.reactiver')}
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
              {t('superAdmin.header.plateforme')}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={handleLogout}>
              {t('superAdmin.header.deconnexion')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader
          overline={t('superAdmin.header.overline')}
          title={t('superAdmin.header.titre')}
        />

        {/* Bandeau de KPIs. */}
        <div className="nk-reveal nk-d1 mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Building2}
            label={t('superAdmin.kpi.organisations')}
            value={loading ? '—' : String(kpis.total)}
          />
          <StatCard
            icon={CheckCircle2}
            tone="jade"
            label={t('superAdmin.kpi.actives')}
            value={loading ? '—' : String(kpis.actives)}
            hint={loading ? undefined : t('superAdmin.kpi.activesHint')}
          />
          <StatCard
            icon={PauseCircle}
            label={t('superAdmin.kpi.suspendues')}
            value={loading ? '—' : String(kpis.suspendues)}
            hint={loading ? undefined : t('superAdmin.kpi.suspenduesHint')}
          />
          <StatCard
            icon={Users}
            tone="brass"
            label={t('superAdmin.kpi.membres')}
            value={loading ? '—' : String(kpis.membres)}
            hint={loading ? undefined : t('superAdmin.kpi.membresHint')}
          />
        </div>

        {/* Toolbar : recherche + filtre par statut. */}
        <div className="nk-reveal nk-d2 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('superAdmin.filtres.recherche')}
              aria-label={t('superAdmin.filtres.rechercheLabel')}
              className="pl-9"
            />
          </div>

          <div
            role="group"
            aria-label={t('superAdmin.filtres.statutLabel')}
            className="inline-flex shrink-0 rounded-xl border border-hairline-strong bg-surface-2/70 p-0.5"
          >
            {segments.map((seg) => {
              const actif = filtreStatut === seg.cle
              return (
                <button
                  key={seg.cle}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setFiltreStatut(seg.cle)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60',
                    actif
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {seg.libelle}
                  <span className={cn('num text-[0.7rem]', actif ? 'text-brass' : 'text-faint')}>
                    {seg.compte}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="nk-reveal nk-d3 mt-5">
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
              title={t('superAdmin.vide.titre')}
              className="min-h-[40vh] justify-center"
              description={t('superAdmin.vide.description')}
            />
          )}

          {!loading && !error && organisations && organisations.length > 0 && triees.length === 0 && (
            <EmptyState
              icon={Search}
              title={t('superAdmin.vide.aucunResultatTitre')}
              description={t('superAdmin.vide.aucunResultatDescription')}
              className="min-h-[30vh] justify-center"
              action={
                <Button variant="ghost" size="sm" onClick={resetFiltres}>
                  {t('superAdmin.vide.reinitialiser')}
                </Button>
              }
            />
          )}

          {!loading && !error && triees.length > 0 && (
            <Card className="overflow-hidden p-0">
              <DataTable
                caption={t('superAdmin.table.caption')}
                columns={colonnes}
                rows={triees}
                rowKey={(o) => o.id}
                sort={tri}
                onSort={trierPar}
              />
            </Card>
          )}
        </div>
      </div>

      {/* Confirmation de suspension — action à conséquence (bloque tout un espace). */}
      <Modal
        open={cibleSuspension !== null}
        onClose={() => (suspending ? undefined : setCibleSuspension(null))}
        title={t('superAdmin.modal.titre')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/[0.08] px-3.5 py-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t('superAdmin.modal.avertDebut')}
              <span className="font-medium text-foreground">{cibleSuspension?.nom}</span>
              {t('superAdmin.modal.avertMilieu')}
              <span className="text-foreground">{t('superAdmin.modal.avertSupprimee')}</span>
              {t('superAdmin.modal.avertFin')}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={suspending}
              onClick={() => setCibleSuspension(null)}
            >
              {t('superAdmin.modal.annuler')}
            </Button>
            <Button
              type="button"
              variant="danger"
              icon={PauseCircle}
              loading={suspending}
              onClick={confirmerSuspension}
            >
              {t('superAdmin.modal.suspendreAcces')}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  )
}

export default SuperAdminPage
