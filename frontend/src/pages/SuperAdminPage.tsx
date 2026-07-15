import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  Eye,
  Fingerprint,
  Languages,
  LogOut,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { platformApi, ApiError, messageErreur, type PlatformOrganisation } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { DataTable, type Column, type SortDir } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { Input } from '@/components/ui/Field'
import { cn, formatDate } from '@/lib/utils'
import { FORFAITS, limiteMembresForfait, type Forfait } from '@/lib/forfait'
import { cleI18n } from '@/lib/i18n'

/** Format long pour l'info-bulle (attribut title). */
const DATE_LONGUE = { day: 'numeric', month: 'long', year: 'numeric' } as const

/** Clé i18n du libellé d'un forfait (clé DYNAMIQUE → `cleI18n` contourne le typage strict). */
const cleForfait = (f: Forfait) => cleI18n(`commun.forfaits.${f}`)

/** Teinte par forfait (barre de répartition + puces) — jetons du design system. */
const TEINTE_FORFAIT: Record<Forfait, { barre: string; texte: string }> = {
  GRATUIT: { barre: 'bg-jade', texte: 'text-jade' },
  PRO: { barre: 'bg-brass', texte: 'text-brass' },
  ENTREPRISE: { barre: 'bg-amber', texte: 'text-amber' },
}

type FiltreStatut = 'tous' | 'actives' | 'suspendues'
type FiltreForfait = 'tous' | Forfait
type ColonneTri = 'organisation' | 'forfait' | 'membres' | 'creee' | 'statut'

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
 * terra (plafond atteint). `max === null` = forfait illimité (Pro/Entreprise) → mention.
 */
function QuotaMembres({
  n,
  max,
  illimiteLabel,
  ariaLabel,
  titre,
}: {
  n: number
  max: number | null
  illimiteLabel: string
  ariaLabel: string
  titre?: string
}) {
  if (max === null) {
    return (
      <div className="w-full" title={titre}>
        <div className="flex items-baseline justify-end gap-1">
          <span className="num text-sm font-medium text-foreground">{n}</span>
          <span className="text-xs text-faint">/ {illimiteLabel}</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-jade/40" style={{ width: '100%' }} />
        </div>
      </div>
    )
  }
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

/** Sélecteur de forfait réutilisé (tableau + fiche détail). MAJ optimiste gérée par le parent. */
function SelecteurForfait({
  org,
  disabled,
  onChange,
  t,
  className,
}: {
  org: PlatformOrganisation
  disabled: boolean
  onChange: (f: Forfait) => void
  t: TFunction
  className?: string
}) {
  return (
    <select
      value={org.forfait}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Forfait)}
      aria-label={t('superAdmin.table.forfaitLabel', { nom: org.nom })}
      className={cn(
        'w-full rounded-lg border border-hairline-strong bg-surface-2/70 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brass/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 disabled:opacity-60',
        className,
      )}
    >
      {FORFAITS.map((f) => (
        <option key={f} value={f}>
          {t(cleForfait(f))}
        </option>
      ))}
    </select>
  )
}

/**
 * Échappe une cellule CSV : (1) anti-injection de FORMULE (Excel/LibreOffice) — un texte
 * commençant par `= + - @` ou une tabulation/CR est préfixé d'une apostrophe pour qu'il ne soit
 * pas interprété comme une formule ; (2) guillemets doublés + encadrement si `, ; "` ou saut de ligne.
 */
function celluleCsv(valeur: string | number): string {
  let s = String(valeur)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Console PLATEFORME (SaaS §2.3) — réservée au SUPER_ADMIN (garde SuperAdminRoute).
 *
 * Layout autonome (pas l'AppShell tenant). Gestion des organisations clientes : bandeau de KPIs,
 * répartition des forfaits, recherche (nom + id), filtres (statut + forfait), tri des colonnes,
 * export CSV, attribution de forfait (MAJ optimiste), fiche détail (modale) et suspension /
 * réactivation. Aucune donnée métier n'est exposée : uniquement des métadonnées d'organisation.
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

  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous')
  const [filtreForfait, setFiltreForfait] = useState<FiltreForfait>('tous')
  const [tri, setTri] = useState<{ col: ColonneTri; dir: SortDir }>({ col: 'creee', dir: 'desc' })

  const [cibleSuspension, setCibleSuspension] = useState<PlatformOrganisation | null>(null)
  const [suspending, setSuspending] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

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

  // KPIs plateforme (sur l'ensemble non filtré) + répartition par forfait.
  const kpis = useMemo(() => {
    const liste = organisations ?? []
    const total = liste.length
    const actives = liste.filter((o) => o.actif).length
    const parForfait = FORFAITS.reduce(
      (acc, f) => ({ ...acc, [f]: liste.filter((o) => o.forfait === f).length }),
      {} as Record<Forfait, number>,
    )
    return {
      total,
      actives,
      suspendues: total - actives,
      membres: liste.reduce((somme, o) => somme + o.nbMembres, 0),
      parForfait,
    }
  }, [organisations])

  // Filtrage (recherche par nom OU id + statut + forfait).
  const filtrees = useMemo(() => {
    if (!organisations) return []
    const q = recherche.trim().toLowerCase()
    return organisations.filter((o) => {
      if (q && !o.nom.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false
      if (filtreStatut === 'actives' && !o.actif) return false
      if (filtreStatut === 'suspendues' && o.actif) return false
      if (filtreForfait !== 'tous' && o.forfait !== filtreForfait) return false
      return true
    })
  }, [organisations, recherche, filtreStatut, filtreForfait])

  // Tri client.
  const triees = useMemo(() => {
    const rangForfait = (f: Forfait) => FORFAITS.indexOf(f)
    const cmp = (a: PlatformOrganisation, b: PlatformOrganisation): number => {
      switch (tri.col) {
        case 'forfait':
          return rangForfait(a.forfait) - rangForfait(b.forfait)
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
    setFiltreForfait('tous')
  }

  const detailOrg = useMemo(
    () => (detailId ? (organisations?.find((o) => o.id === detailId) ?? null) : null),
    [detailId, organisations],
  )

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

  /** Attribue un forfait (activation manuelle §3.1) + MAJ optimiste (rollback en cas d'échec). */
  const changerForfait = async (org: PlatformOrganisation, forfait: Forfait) => {
    if (!accessToken || forfait === org.forfait) return
    const precedent = org.forfait
    setOrganisations((prev) =>
      prev ? prev.map((o) => (o.id === org.id ? { ...o, forfait } : o)) : prev,
    )
    setPendingId(org.id)
    try {
      await platformApi.changerForfait(org.id, forfait, accessToken)
      toast.success(t('superAdmin.toast.forfaitMisAJour'), org.nom)
    } catch (err) {
      setOrganisations((prev) =>
        prev ? prev.map((o) => (o.id === org.id ? { ...o, forfait: precedent } : o)) : prev,
      )
      toast.error(
        t('superAdmin.toast.forfaitImpossible'),
        err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'),
      )
    } finally {
      setPendingId(null)
    }
  }

  /** Copie une valeur (id, etc.) dans le presse-papier + toast de confirmation. */
  const copier = async (valeur: string, libelle: string) => {
    try {
      await navigator.clipboard.writeText(valeur)
      toast.success(libelle)
    } catch {
      toast.error(t('superAdmin.toast.copieImpossible'))
    }
  }

  /** Export CSV (client-side) des organisations filtrées — nom, forfait, membres, statut, etc. */
  const exporterCsv = () => {
    const entetes = [
      t('superAdmin.table.organisation'),
      t('superAdmin.table.forfait'),
      t('superAdmin.table.membres'),
      t('superAdmin.export.limite'),
      t('superAdmin.table.statut'),
      t('superAdmin.export.devise'),
      t('superAdmin.export.langue'),
      t('superAdmin.export.identifiant'),
      t('superAdmin.table.creeeLe'),
    ]
    const lignes = triees.map((o) => {
      const limite = limiteMembresForfait(o.forfait)
      return [
        o.nom,
        t(cleForfait(o.forfait)),
        o.nbMembres,
        limite ?? t('superAdmin.table.illimite'),
        o.actif ? t('superAdmin.table.active') : t('superAdmin.table.suspendue'),
        o.devise,
        o.langueDefaut,
        o.id,
        formatDate(o.createdAt, DATE_LONGUE),
      ]
    })
    const csv = [entetes, ...lignes].map((row) => row.map(celluleCsv).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('superAdmin.export.nomFichier')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const segmentsStatut: { cle: FiltreStatut; libelle: string; compte: number }[] = [
    { cle: 'tous', libelle: t('superAdmin.filtres.statutTous'), compte: kpis.total },
    { cle: 'actives', libelle: t('superAdmin.filtres.statutActives'), compte: kpis.actives },
    { cle: 'suspendues', libelle: t('superAdmin.filtres.statutSuspendues'), compte: kpis.suspendues },
  ]
  const segmentsForfait: { cle: FiltreForfait; libelle: string; compte: number }[] = [
    { cle: 'tous', libelle: t('superAdmin.filtres.forfaitTous'), compte: kpis.total },
    ...FORFAITS.map((f) => ({ cle: f, libelle: t(cleForfait(f)), compte: kpis.parForfait[f] })),
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
      key: 'forfait',
      header: t('superAdmin.table.forfait'),
      width: '9.5rem',
      sortable: true,
      cell: (o) => (
        <SelecteurForfait
          org={o}
          disabled={pendingId === o.id}
          onChange={(f) => changerForfait(o, f)}
          t={t}
        />
      ),
    },
    {
      key: 'membres',
      header: t('superAdmin.table.membres'),
      width: '10rem',
      numeric: true,
      sortable: true,
      cell: (o) => {
        const max = limiteMembresForfait(o.forfait)
        return (
          <QuotaMembres
            n={o.nbMembres}
            max={max}
            illimiteLabel={t('superAdmin.table.illimite')}
            ariaLabel={t('superAdmin.table.quotaAria', {
              n: o.nbMembres,
              max: max ?? t('superAdmin.table.illimite'),
            })}
            titre={
              max !== null && o.nbMembres >= max
                ? t('superAdmin.table.quotaAtteint')
                : max !== null && o.nbMembres / max >= 0.8
                  ? t('superAdmin.table.quotaProche')
                  : undefined
            }
          />
        )
      },
    },
    {
      key: 'creee',
      header: t('superAdmin.table.creeeLe'),
      width: '8.5rem',
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
      width: '7rem',
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
      cell: (o) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => copier(o.id, t('superAdmin.toast.idCopie'))}
            aria-label={t('superAdmin.table.copierId', { nom: o.nom })}
            title={t('superAdmin.table.copierId', { nom: o.nom })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDetailId(o.id)}
            aria-label={t('superAdmin.table.ouvrirDetail', { nom: o.nom })}
            title={t('superAdmin.table.ouvrirDetail', { nom: o.nom })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]

  const aucuneOrg = !loading && !error && organisations && organisations.length === 0
  const aucunResultat = !loading && !error && (organisations?.length ?? 0) > 0 && triees.length === 0

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
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

      <div className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader overline={t('superAdmin.header.overline')} title={t('superAdmin.header.titre')} />

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

        {/* Répartition des forfaits — barre empilée + légende chiffrée. */}
        {!loading && !error && kpis.total > 0 && (
          <Card className="nk-reveal nk-d2 mt-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <Overline>{t('superAdmin.repartition.titre')}</Overline>
              <span className="text-xs text-faint">
                {t('superAdmin.repartition.total', { count: kpis.total })}
              </span>
            </div>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              {FORFAITS.map((f) =>
                kpis.parForfait[f] > 0 ? (
                  <div
                    key={f}
                    className={cn('h-full transition-all', TEINTE_FORFAIT[f].barre)}
                    style={{ width: `${(kpis.parForfait[f] / kpis.total) * 100}%` }}
                    title={`${t(cleForfait(f))} · ${kpis.parForfait[f]}`}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {FORFAITS.map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', TEINTE_FORFAIT[f].barre)} aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{t(cleForfait(f))}</span>
                  <span className={cn('num text-xs font-medium', TEINTE_FORFAIT[f].texte)}>
                    {kpis.parForfait[f]}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Toolbar : recherche + export, puis filtres statut & forfait. */}
        <div className="nk-reveal nk-d3 mt-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
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
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              onClick={exporterCsv}
              disabled={triees.length === 0}
            >
              {t('superAdmin.export.bouton')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentFiltre
              ariaLabel={t('superAdmin.filtres.statutLabel')}
              segments={segmentsStatut}
              actif={filtreStatut}
              onSelect={setFiltreStatut}
            />
            <SegmentFiltre
              ariaLabel={t('superAdmin.filtres.forfaitLabel')}
              segments={segmentsForfait}
              actif={filtreForfait}
              onSelect={setFiltreForfait}
            />
          </div>
        </div>

        <div className="nk-reveal nk-d4 mt-5">
          {loading && (
            <Card className="overflow-hidden p-0">
              <RowsSkeleton rows={5} />
            </Card>
          )}

          {!loading && error && (
            <ErrorState title={t('commun.erreurs.chargementImpossible')} description={error} />
          )}

          {aucuneOrg && (
            <EmptyState
              icon={Building2}
              title={t('superAdmin.vide.titre')}
              className="min-h-[40vh] justify-center"
              description={t('superAdmin.vide.description')}
            />
          )}

          {aucunResultat && (
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

      {/* Fiche détail d'une organisation (modale focus-trap). */}
      <Modal
        open={detailOrg !== null}
        onClose={() => setDetailId(null)}
        title={detailOrg?.nom ?? ''}
      >
        {detailOrg && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {detailOrg.actif ? (
                <Badge tone="jade" size="sm" dot>
                  {t('superAdmin.table.active')}
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm">
                  {t('superAdmin.table.suspendue')}
                </Badge>
              )}
              <Badge tone="brass" size="sm">
                {t(cleForfait(detailOrg.forfait))}
              </Badge>
            </div>

            <dl className="divide-y divide-hairline rounded-xl border border-hairline">
              <DetailLigne icon={Coins} label={t('superAdmin.export.devise')} value={detailOrg.devise} />
              <DetailLigne
                icon={Languages}
                label={t('superAdmin.export.langue')}
                value={detailOrg.langueDefaut}
              />
              <DetailLigne
                icon={CalendarDays}
                label={t('superAdmin.table.creeeLe')}
                value={formatDate(detailOrg.createdAt, DATE_LONGUE)}
              />
              <div className="flex items-center gap-3 px-4 py-3">
                <Fingerprint className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
                    {t('superAdmin.export.identifiant')}
                  </dt>
                  <dd className="truncate font-mono text-xs text-muted-foreground">{detailOrg.id}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => copier(detailOrg.id, t('superAdmin.toast.idCopie'))}
                  aria-label={t('superAdmin.table.copierId', { nom: detailOrg.nom })}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </dl>

            {/* Quota + forfait. */}
            <div className="rounded-xl border border-hairline p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
                  {t('superAdmin.detail.forfait')}
                </span>
                <SelecteurForfait
                  org={detailOrg}
                  disabled={pendingId === detailOrg.id}
                  onChange={(f) => changerForfait(detailOrg, f)}
                  t={t}
                  className="w-36"
                />
              </div>
              <div className="mt-3">
                <QuotaMembres
                  n={detailOrg.nbMembres}
                  max={limiteMembresForfait(detailOrg.forfait)}
                  illimiteLabel={t('superAdmin.table.illimite')}
                  ariaLabel={t('superAdmin.table.quotaAria', {
                    n: detailOrg.nbMembres,
                    max: limiteMembresForfait(detailOrg.forfait) ?? t('superAdmin.table.illimite'),
                  })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-hairline pt-4">
              <Button variant="ghost" onClick={() => setDetailId(null)}>
                {t('superAdmin.detail.fermer')}
              </Button>
              {detailOrg.actif ? (
                <Button
                  variant="danger"
                  icon={PauseCircle}
                  onClick={() => {
                    const cible = detailOrg
                    setDetailId(null)
                    setCibleSuspension(cible)
                  }}
                >
                  {t('superAdmin.table.suspendre')}
                </Button>
              ) : (
                <Button
                  variant="jade"
                  icon={PlayCircle}
                  loading={pendingId === detailOrg.id}
                  onClick={() => reactiver(detailOrg)}
                >
                  {t('superAdmin.table.reactiver')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

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

/** Groupe de filtres segmentés (pilules avec compteur). Générique sur la valeur de segment. */
function SegmentFiltre<T extends string>({
  ariaLabel,
  segments,
  actif,
  onSelect,
}: {
  ariaLabel: string
  segments: { cle: T; libelle: string; compte: number }[]
  actif: T
  onSelect: (cle: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded-xl border border-hairline-strong bg-surface-2/70 p-0.5"
    >
      {segments.map((seg) => {
        const estActif = actif === seg.cle
        return (
          <button
            key={seg.cle}
            type="button"
            aria-pressed={estActif}
            onClick={() => onSelect(seg.cle)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60',
              estActif
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {seg.libelle}
            <span className={cn('num text-2xs', estActif ? 'text-brass' : 'text-faint')}>
              {seg.compte}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Ligne d'information de la fiche détail (icône + libellé + valeur). */
function DetailLigne({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  )
}

export default SuperAdminPage
