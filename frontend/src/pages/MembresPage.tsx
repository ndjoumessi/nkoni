import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  messageErreur,
  type MembreStatut,
  type StatutMembre,
  type StatutContribution,
} from '@/lib/api'
import { estMembreSimple, peutGererMembres } from '@/lib/roles'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

type ColonneTri = 'nom' | 'branche' | 'statut' | 'cotisation' | 'adhesion'
const ORDRE_STATUT: Record<string, number> = { ACTIF: 0, INACTIF: 1, DECEDE: 2 }
const ORDRE_COTISATION: Record<string, number> = { A_JOUR: 0, PARTIEL: 1, NON_A_JOUR: 2 }

const STATUTS: { value: StatutMembre; label: string }[] = [
  { value: 'ACTIF', label: 'Actifs' },
  { value: 'INACTIF', label: 'Inactifs' },
  { value: 'DECEDE', label: 'Décédés' },
]

const COTISATIONS: { value: StatutContribution; label: string }[] = [
  { value: 'A_JOUR', label: 'À jour' },
  { value: 'PARTIEL', label: 'Partiel' },
  { value: 'NON_A_JOUR', label: 'Non à jour' },
]

/**
 * Liste des membres. Le statut de cotisation vient de GET /membres/statuts (calculé en
 * masse côté backend) → une seule requête. MEMBRE_SIMPLE est redirigé vers sa fiche.
 */
export function MembresPage() {
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [membres, setMembres] = useState<MembreStatut[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtres initialisés depuis l'URL (dashboard actionnable : ?statut= / ?cotisation= / ?branche=).
  const [searchParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const [filtreBranche, setFiltreBranche] = useState(searchParams.get('branche') ?? '')
  const [filtreStatut, setFiltreStatut] = useState(searchParams.get('statut') ?? '')
  const [filtreCotisation, setFiltreCotisation] = useState(searchParams.get('cotisation') ?? '')
  const [triCol, setTriCol] = useState<ColonneTri>('nom')
  const [triDir, setTriDir] = useState<'asc' | 'desc'>('asc')

  const gestion = peutGererMembres(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await membresApi.listStatuts(accessToken, controller.signal)
        if (active) setMembres(data)
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

  // MEMBRE_SIMPLE : le backend ne renvoie que sa fiche → on redirige vers son détail.
  useEffect(() => {
    if (estMembreSimple(user?.role) && membres && membres.length > 0) {
      navigate(`/membres/${membres[0].id}`, { replace: true })
    }
  }, [user?.role, membres, navigate])

  const branches = useMemo(() => {
    const map = new Map<string, string>()
    membres?.forEach((m) => {
      if (m.branche) map.set(m.branche.id, m.branche.nom)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [membres])

  const filtres = useMemo(() => {
    if (!membres) return []
    const q = recherche.trim().toLowerCase()
    return membres.filter((m) => {
      if (q && !`${m.nom} ${m.prenom}`.toLowerCase().includes(q)) return false
      if (filtreBranche && m.brancheId !== filtreBranche) return false
      if (filtreStatut && m.statut !== filtreStatut) return false
      if (filtreCotisation && m.statutCotisation !== filtreCotisation) return false
      return true
    })
  }, [membres, recherche, filtreBranche, filtreStatut, filtreCotisation])

  // Tri client (toutes les données sont chargées → tri fiable, pas seulement une page).
  const triees = useMemo(() => {
    const cmp = (a: MembreStatut, b: MembreStatut): number => {
      switch (triCol) {
        case 'branche':
          return (a.branche?.nom ?? '').localeCompare(b.branche?.nom ?? '')
        case 'statut':
          return (ORDRE_STATUT[a.statut] ?? 9) - (ORDRE_STATUT[b.statut] ?? 9)
        case 'cotisation':
          return (ORDRE_COTISATION[a.statutCotisation] ?? 9) - (ORDRE_COTISATION[b.statutCotisation] ?? 9)
        case 'adhesion':
          return a.anneeAdhesion - b.anneeAdhesion
        default:
          return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)
      }
    }
    const arr = [...filtres].sort(cmp)
    return triDir === 'desc' ? arr.reverse() : arr
  }, [filtres, triCol, triDir])

  // Synthèse (point focal) — calculée sur l'ensemble non filtré.
  const resume = useMemo(() => {
    const base = membres ?? []
    return {
      total: base.length,
      aJour: base.filter((m) => m.statutCotisation === 'A_JOUR').length,
      nonAJour: base.filter((m) => m.statutCotisation === 'NON_A_JOUR').length,
      inactifs: base.filter((m) => m.statut !== 'ACTIF').length,
    }
  }, [membres])

  const trierPar = (col: ColonneTri) => {
    if (triCol === col) setTriDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setTriCol(col)
      setTriDir('asc')
    }
  }

  if (estMembreSimple(user?.role)) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-brass" aria-label="Redirection" />
      </div>
    )
  }

  const colonnes: Column<MembreStatut>[] = [
    {
      key: 'nom',
      header: 'Membre',
      sortable: true,
      cell: (m) => (
        <span className="font-medium text-foreground">
          {m.nom} <span className="text-muted-foreground">{m.prenom}</span>
        </span>
      ),
    },
    {
      key: 'branche',
      header: 'Branche',
      sortable: true,
      cell: (m) => <span className="text-muted-foreground">{m.branche?.nom ?? '—'}</span>,
    },
    {
      key: 'statut',
      header: 'Statut',
      sortable: true,
      cell: (m) => <StatutMembreBadge statut={m.statut} size="sm" />,
    },
    {
      key: 'cotisation',
      header: 'Cotisation',
      sortable: true,
      cell: (m) => <StatutCotisationBadge statut={m.statutCotisation} size="sm" />,
    },
    {
      key: 'adhesion',
      header: 'Adhésion',
      sortable: true,
      numeric: true,
      cell: (m) => m.anneeAdhesion,
    },
  ]

  const resetFiltres = () => {
    setRecherche('')
    setFiltreBranche('')
    setFiltreStatut('')
    setFiltreCotisation('')
  }

  return (
    <>
      <PageHeader
        overline="Communauté"
        title="Membres"
        description={
          membres
            ? `${filtres.length} / ${membres.length} membre${membres.length > 1 ? 's' : ''}`
            : undefined
        }
        actions={
          gestion && (
            <ButtonLink to="/membres/nouveau" icon={Plus}>
              Nouveau membre
            </ButtonLink>
          )
        }
      />

      {/* Synthèse (point focal) */}
      {membres && membres.length > 0 && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Membres" value={String(resume.total)} icon={Users} />
          <StatCard
            label="À jour"
            value={String(resume.aJour)}
            tone="jade"
            icon={CheckCircle2}
            hint={resume.total ? `${Math.round((resume.aJour / resume.total) * 100)}%` : undefined}
          />
          <StatCard label="Non à jour" value={String(resume.nonAJour)} tone="brass" icon={AlertTriangle} />
          <StatCard label="Inactifs / décédés" value={String(resume.inactifs)} icon={Users} />
        </div>
      )}

      {/* Filtres */}
      <div className="nk-reveal nk-d3 mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par nom ou prénom…"
            className="pl-10"
            aria-label="Rechercher un membre"
          />
        </div>
        <Select
          value={filtreBranche}
          onChange={(e) => setFiltreBranche(e.target.value)}
          aria-label="Filtrer par branche"
        >
          <option value="">Toutes les branches</option>
          {branches.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </Select>
        <Select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          aria-label="Filtrer par statut de membre"
        >
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={filtreCotisation}
          onChange={(e) => setFiltreCotisation(e.target.value)}
          aria-label="Filtrer par cotisation"
        >
          <option value="">Toutes cotisations</option>
          {COTISATIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Contenu */}
      <div className="nk-reveal nk-d3 mt-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={6} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && membres && membres.length === 0 && (
          <EmptyState
            icon={Users}
            title="Aucun membre pour l'instant"
            className="min-h-[52vh] justify-center"
            description="Commencez à constituer votre communauté en ajoutant les premiers membres."
            action={
              gestion && (
                <ButtonLink to="/membres/nouveau" icon={Plus}>
                  Ajouter un membre
                </ButtonLink>
              )
            }
            tips={[
              { icon: Search, label: 'Recherche & filtres par branche/statut' },
              { icon: Users, label: 'Suivi de cotisation par membre' },
            ]}
          />
        )}

        {!loading && !error && membres && membres.length > 0 && (
          <Card className="overflow-hidden p-0">
            {triees.length > 0 ? (
              <DataTable
                caption="Liste des membres, triable par colonne"
                columns={colonnes}
                rows={triees}
                rowKey={(m) => m.id}
                rowHref={(m) => `/membres/${m.id}`}
                sort={{ col: triCol, dir: triDir }}
                onSort={(c) => trierPar(c as ColonneTri)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun membre ne correspond aux filtres.
                </p>
                <Button variant="ghost" size="sm" onClick={resetFiltres}>
                  Réinitialiser les filtres
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  )
}

export default MembresPage
