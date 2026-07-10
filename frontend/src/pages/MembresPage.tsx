import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, Upload, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  organisationApi,
  messageErreur,
  type MembreStatut,
  type StatutMembre,
  type StatutContribution,
} from '@/lib/api'
import { estMembreSimple, peutGererMembres } from '@/lib/roles'
import { resumeMembres } from '@/lib/membres'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
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

const STATUTS: StatutMembre[] = ['ACTIF', 'INACTIF', 'DECEDE']
const COTISATIONS: StatutContribution[] = ['A_JOUR', 'PARTIEL', 'NON_A_JOUR']

/**
 * Liste des membres. Le statut de cotisation vient de GET /membres/statuts (calculé en
 * masse côté backend) → une seule requête. MEMBRE_SIMPLE est redirigé vers sa fiche.
 */
export function MembresPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [membres, setMembres] = useState<MembreStatut[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Chef de l'organisation (badge sur sa ligne) — best-effort, chargé indépendamment.
  const [chef, setChef] = useState<{ id: string | null; surnom: string | null }>({ id: null, surnom: null })

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

  // Chef de l'organisation : chargé à part (best-effort, jamais bloquant pour la liste).
  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const org = await organisationApi.moi(accessToken, controller.signal)
        if (active) setChef({ id: org.chefMembreId, surnom: org.chefSurnom })
      } catch {
        /* pas d'accès (ex. droits) ou erreur → aucun badge chef, sans conséquence */
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

  // Synthèse (point focal) — sur l'ensemble non filtré. « À jour »/« Non à jour » ne comptent que
  // les membres ACTIF (obligation active) ; un DECEDE/INACTIF ne pèse que dans « Inactifs/Décédés ».
  const resume = useMemo(() => resumeMembres(membres ?? []), [membres])

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
        <Loader2 className="h-6 w-6 animate-spin text-brass" aria-label={t('membres.liste.redirection')} />
      </div>
    )
  }

  const colonnes: Column<MembreStatut>[] = [
    {
      key: 'nom',
      header: t('membres.liste.colonnes.membre'),
      sortable: true,
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">
            {m.nom} <span className="text-muted-foreground">{m.prenom}</span>
          </span>
          {chef.id === m.id && (
            <>
              <Badge tone="brass" size="sm">
                {t('membres.chef.badge')}
              </Badge>
              {chef.surnom && <span className="text-xs text-faint">« {chef.surnom} »</span>}
            </>
          )}
        </span>
      ),
    },
    {
      key: 'branche',
      header: t('membres.liste.colonnes.branche'),
      sortable: true,
      cell: (m) => <span className="text-muted-foreground">{m.branche?.nom ?? '—'}</span>,
    },
    {
      key: 'statut',
      header: t('membres.liste.colonnes.statut'),
      sortable: true,
      cell: (m) => <StatutMembreBadge statut={m.statut} size="sm" />,
    },
    {
      key: 'cotisation',
      header: t('membres.liste.colonnes.cotisation'),
      sortable: true,
      cell: (m) => <StatutCotisationBadge statut={m.statutCotisation} size="sm" />,
    },
    {
      key: 'adhesion',
      header: t('membres.liste.colonnes.adhesion'),
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
        overline={t('membres.liste.overline')}
        title={t('membres.liste.titre')}
        description={
          membres
            ? t('membres.liste.compteur', {
                filtres: filtres.length,
                total: membres.length,
                count: membres.length,
              })
            : undefined
        }
        actions={
          gestion && (
            <div className="flex flex-wrap gap-2">
              <ButtonLink to="/membres/import" variant="outline" icon={Upload}>
                {t('import.boutonNav')}
              </ButtonLink>
              {/* « Nouveau » masqué quand la liste est vide : l'EmptyState porte déjà ce CTA. */}
              {(!membres || membres.length > 0) && (
                <ButtonLink to="/membres/nouveau" icon={Plus}>
                  {t('membres.liste.nouveau')}
                </ButtonLink>
              )}
            </div>
          )
        }
      />

      {/* Synthèse (point focal) */}
      {membres && membres.length > 0 && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('membres.liste.resume.membres')} value={String(resume.total)} icon={Users} />
          <StatCard
            label={t('membres.liste.resume.aJour')}
            value={String(resume.aJour)}
            tone="jade"
            icon={CheckCircle2}
            // % à jour PARMI les membres actifs (dénominateur = population éligible, pas l'effectif total).
            hint={resume.actifs ? `${Math.round((resume.aJour / resume.actifs) * 100)}%` : undefined}
          />
          <StatCard label={t('membres.liste.resume.nonAJour')} value={String(resume.nonAJour)} tone="brass" icon={AlertTriangle} />
          <StatCard label={t('membres.liste.resume.inactifsDecedes')} value={String(resume.inactifs)} icon={Users} />
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
            placeholder={t('membres.liste.filtres.recherchePlaceholder')}
            className="pl-10"
            aria-label={t('membres.liste.filtres.rechercheAria')}
          />
        </div>
        <Select
          value={filtreBranche}
          onChange={(e) => setFiltreBranche(e.target.value)}
          aria-label={t('membres.liste.filtres.brancheAria')}
        >
          <option value="">{t('membres.liste.filtres.toutesBranches')}</option>
          {branches.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </Select>
        <Select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          aria-label={t('membres.liste.filtres.statutAria')}
        >
          <option value="">{t('membres.liste.filtres.tousStatuts')}</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {t(`membres.liste.statutOptions.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          value={filtreCotisation}
          onChange={(e) => setFiltreCotisation(e.target.value)}
          aria-label={t('membres.liste.filtres.cotisationAria')}
        >
          <option value="">{t('membres.liste.filtres.toutesCotisations')}</option>
          {COTISATIONS.map((s) => (
            <option key={s} value={s}>
              {t(`membres.liste.cotisationOptions.${s}`)}
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
            title={t('membres.liste.empty.titre')}
            className="min-h-[52vh] justify-center"
            description={t('membres.liste.empty.description')}
            action={
              gestion && (
                <ButtonLink to="/membres/nouveau" icon={Plus}>
                  {t('membres.liste.empty.action')}
                </ButtonLink>
              )
            }
            tips={[
              { icon: Search, label: t('membres.liste.empty.tips.recherche') },
              { icon: Users, label: t('membres.liste.empty.tips.suivi') },
            ]}
          />
        )}

        {!loading && !error && membres && membres.length > 0 && (
          <Card className="overflow-hidden p-0">
            {triees.length > 0 ? (
              <DataTable
                caption={t('membres.liste.caption')}
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
                  {t('membres.liste.aucunCorrespond')}
                </p>
                <Button variant="ghost" size="sm" onClick={resetFiltres}>
                  {t('membres.liste.reinitialiser')}
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
