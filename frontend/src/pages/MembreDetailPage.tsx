import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Pencil, Plus } from 'lucide-react'
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 text-sm text-white/85">{value || '—'}</dd>
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
 * contributions (avec versements dépliables et lien de saisie).
 *
 * Accès en couches selon la matrice §2 :
 *  - Le CŒUR (fiche membre) : tout rôle Lecture sur Membre. MEMBRE_SIMPLE sur une AUTRE
 *    fiche → 403 → redirection propre.
 *  - Le FINANCIER (statut + contributions) : nécessite Lecture sur Contribution ; le
 *    SECRETAIRE n'y a pas droit → chargé en best-effort, le bloc est simplement masqué.
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
      // 1) Cœur : la fiche membre. C'est le seul appel dont le 403 redirige (MEMBRE_SIMPLE
      //    sur une autre fiche).
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

      // 2) Financier (statut + contributions) : best-effort. Le SECRETAIRE n'a pas Lecture
      //    sur Contribution (§2) → 403 attendu → on masque simplement le bloc.
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

      // 3) Branches : best-effort pour le nom (MEMBRE_SIMPLE n'y a pas droit → « — »).
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

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/membres"
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Membres
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-20 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && membre && (
          <>
            <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {membre.nom} <span className="text-white/60">{membre.prenom}</span>
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatutMembreBadge statut={membre.statut} />
                  {statut && <StatutCotisationBadge statut={statut.statut} />}
                </div>
              </div>
              {peutGererMembres(user?.role) && (
                <Link
                  to={`/membres/${membre.id}/editer`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Modifier
                </Link>
              )}
            </header>

            {statut && (
              <section className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-wider text-white/40">Total attendu (cumulé)</p>
                  <p className="mt-2 text-xl font-semibold">{formatFcfa(statut.totalAttenduCumule)}</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-wider text-white/40">Total valorisé (cumulé)</p>
                  <p className="mt-2 text-xl font-semibold">{formatFcfa(statut.totalValoriseCumule)}</p>
                </div>
              </section>
            )}

            <section className="mt-4 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl">
              <h2 className="text-xs uppercase tracking-wider text-white/40">Informations</h2>
              <dl className="mt-4 grid gap-5 sm:grid-cols-2">
                <Info label="Sexe" value={membre.sexe ?? '—'} />
                <Info label="Date de naissance" value={formatDate(membre.dateNaissance)} />
                <Info label="Fonction sociale" value={membre.fonctionSociale ?? '—'} />
                <Info label="Branche familiale" value={brancheNom} />
                <Info label="Téléphone" value={membre.telephone ?? '—'} />
                <Info label="Adresse" value={membre.adresse ?? '—'} />
                <Info label="Année d’adhésion" value={String(membre.anneeAdhesion)} />
                <Info
                  label="Fin de contribution"
                  value={membre.anneeFinContribution ? String(membre.anneeFinContribution) : '—'}
                />
              </dl>
            </section>

            {financierAccessible && (
              <section className="mt-4 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs uppercase tracking-wider text-white/40">
                    Contributions & versements
                  </h2>
                  {peutSaisirVersement(user?.role) && (
                    <Link
                      to={`/membres/${membre.id}/versements/nouveau`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Saisir un versement
                    </Link>
                  )}
                </div>
                {contributions.length === 0 ? (
                  <p className="mt-4 text-sm text-white/40">
                    Aucune contribution enregistrée. Utilisez « Saisir un versement » pour ouvrir
                    une année.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {contributions.map((c) => {
                      const expanded = expandedContrib === c.id
                      return (
                        <li
                          key={c.id}
                          className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedContrib(expanded ? null : c.id)}
                              className="flex items-center gap-2 text-sm font-medium text-white transition hover:text-white/80"
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              )}
                              Année {c.annee}
                            </button>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/55">
                              <span>Attendu {formatFcfa(c.montantAttendu)}</span>
                              <span>Versé {formatFcfa(c.montantVerse)}</span>
                              <span>Valorisé {formatFcfa(c.montantValorise)}</span>
                            </div>
                            {peutSaisirVersement(user?.role) && (
                              <Link
                                to={`/membres/${membre.id}/versements/nouveau?contributionId=${c.id}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                Versement
                              </Link>
                            )}
                          </div>
                          {expanded && (
                            <div className="border-t border-white/10 bg-white/[0.02]">
                              <VersementsList contributionId={c.id} membreId={membre.id} />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default MembreDetailPage
