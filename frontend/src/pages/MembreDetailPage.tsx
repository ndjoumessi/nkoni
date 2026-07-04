import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  branchesApi,
  contributionsApi,
  ApiError,
  type Membre,
  type StatutCumule,
  type Contribution,
  type Branche,
} from '@/lib/api'
import { peutGererMembres, peutSaisirVersement } from '@/lib/roles'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { VersementsList } from '@/components/VersementsList'
import { formatFcfa } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1 text-sm text-foreground/85">{value || '—'}</dd>
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/**
 * Fiche complète d'un membre : infos + statut cumulatif (§4.1) + historique des
 * contributions (versements dépliables). Accès en couches selon la matrice §2.
 */
export function MembreDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [membre, setMembre] = useState<Membre | null>(null)
  const [statut, setStatut] = useState<StatutCumule | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [financierAccessible, setFinancierAccessible] = useState(false)
  const [branches, setBranches] = useState<Branche[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedContrib, setExpandedContrib] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const m = await membresApi.get(id, accessToken, signal)
        if (!active) return
        setMembre(m)
        setLoading(false)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (e instanceof ApiError && e.status === 403) {
          navigate('/dashboard', { replace: true })
          return
        }
        if (active) {
          setError(e instanceof ApiError ? e.message : 'Erreur de chargement de la fiche.')
          setLoading(false)
        }
        return
      }

      try {
        const [s, c] = await Promise.all([
          membresApi.statut(id, accessToken, signal),
          contributionsApi.listByMembre(id, accessToken, signal),
        ])
        if (active) {
          setStatut(s)
          setContributions([...c].sort((a, b) => b.annee - a.annee))
          setFinancierAccessible(true)
        }
      } catch {
        /* pas d'accès au financier (ex. SECRETAIRE) → bloc masqué */
      }

      try {
        const b = await branchesApi.list(accessToken, signal)
        if (active) setBranches(b)
      } catch {
        /* pas d'accès aux branches → nom non résolu */
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, navigate])

  const brancheNom = useMemo(() => {
    if (!membre?.brancheId) return '—'
    return branches.find((b) => b.id === membre.brancheId)?.nom ?? '—'
  }, [membre, branches])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-6 h-8 w-64" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-56 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Fiche membre" back={{ to: '/membres', label: 'Membres' }} />
        <Card className="mt-6 border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
      </div>
    )
  }

  if (!membre) return null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: '/membres', label: 'Membres' }}
        title={
          <>
            {membre.nom} <span className="text-muted-foreground">{membre.prenom}</span>
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatutMembreBadge statut={membre.statut} size="sm" />
            {statut && <StatutCotisationBadge statut={statut.statut} size="sm" />}
          </span>
        }
        actions={
          peutGererMembres(user?.role) && (
            <ButtonLink to={`/membres/${membre.id}/editer`} variant="outline" icon={Pencil}>
              Modifier
            </ButtonLink>
          )
        }
      />

      {statut && (
        <section className="nk-reveal nk-d2 mt-7 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <Overline>Total attendu (cumulé)</Overline>
            <p className="num mt-2 text-xl font-semibold text-foreground">
              {formatFcfa(statut.totalAttenduCumule)}
            </p>
          </Card>
          <Card className="p-5">
            <Overline>Total valorisé (cumulé)</Overline>
            <p className="num mt-2 text-xl font-semibold text-jade">
              {formatFcfa(statut.totalValoriseCumule)}
            </p>
          </Card>
        </section>
      )}

      <Card className="nk-reveal nk-d3 mt-4 p-6">
        <Overline>Informations</Overline>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <Info label="Sexe" value={membre.sexe ?? '—'} />
          <Info label="Date de naissance" value={formatDate(membre.dateNaissance)} />
          <Info label="Fonction sociale" value={membre.fonctionSociale ?? '—'} />
          <Info label="Branche familiale" value={brancheNom} />
          <Info label="Téléphone" value={membre.telephone ?? '—'} />
          <Info label="Adresse" value={membre.adresse ?? '—'} />
          <Info label="Année d'adhésion" value={String(membre.anneeAdhesion)} />
          <Info
            label="Fin de contribution"
            value={membre.anneeFinContribution ? String(membre.anneeFinContribution) : '—'}
          />
        </dl>
      </Card>

      {financierAccessible && (
        <Card className="nk-reveal nk-d4 mt-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Overline>Contributions &amp; versements</Overline>
            {peutSaisirVersement(user?.role) && (
              <ButtonLink
                to={`/membres/${membre.id}/versements/nouveau`}
                variant="outline"
                size="sm"
                icon={Plus}
              >
                Saisir un versement
              </ButtonLink>
            )}
          </div>
          {contributions.length === 0 ? (
            <p className="mt-4 text-sm text-faint">
              Aucune contribution enregistrée. Utilisez « Saisir un versement » pour ouvrir une
              année.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {contributions.map((c) => {
                const expanded = expandedContrib === c.id
                return (
                  <li
                    key={c.id}
                    className="overflow-hidden rounded-xl border border-hairline bg-surface/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedContrib(expanded ? null : c.id)}
                        className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-brass"
                        aria-expanded={expanded}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-brass" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-faint" aria-hidden="true" />
                        )}
                        Année {c.annee}
                      </button>
                      <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Attendu {formatFcfa(c.montantAttendu)}</span>
                        <span>Versé {formatFcfa(c.montantVerse)}</span>
                        <span className="text-jade">Valorisé {formatFcfa(c.montantValorise)}</span>
                      </div>
                      {peutSaisirVersement(user?.role) && (
                        <Link
                          to={`/membres/${membre.id}/versements/nouveau?contributionId=${c.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-2/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-brass/40 hover:bg-surface-3"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Versement
                        </Link>
                      )}
                    </div>
                    {expanded && (
                      <div className="border-t border-hairline bg-surface-2/40">
                        <VersementsList contributionId={c.id} membreId={membre.id} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

export default MembreDetailPage
