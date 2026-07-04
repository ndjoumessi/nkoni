import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil } from 'lucide-react'
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
import { peutGererMembres } from '@/lib/roles'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
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
 * contributions. MEMBRE_SIMPLE ne peut voir que sa propre fiche : le backend renvoie 403
 * pour une autre → on redirige proprement vers le tableau de bord.
 */
export function MembreDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [membre, setMembre] = useState<Membre | null>(null)
  const [statut, setStatut] = useState<StatutCumule | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [branches, setBranches] = useState<Branche[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      // Cœur de la fiche : accessible à tout rôle Lecture (et au MEMBRE_SIMPLE pour SA fiche).
      try {
        const [m, s, c] = await Promise.all([
          membresApi.get(id, accessToken, signal),
          membresApi.statut(id, accessToken, signal),
          contributionsApi.listByMembre(id, accessToken, signal),
        ])
        if (!active) return
        setMembre(m)
        setStatut(s)
        setContributions(c)
        setLoading(false)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        // MEMBRE_SIMPLE sur une AUTRE fiche → 403 : redirection propre.
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

      // Branches : best-effort pour afficher le NOM de branche. Le MEMBRE_SIMPLE n'a pas
      // le droit de lecture sur BrancheFamiliale (§2) → un 403 ici est sans conséquence,
      // on retombe simplement sur « — ».
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

            {/* Statut cumulatif */}
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

            {/* Infos */}
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

            {/* Historique contributions */}
            <section className="mt-4 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl">
              <h2 className="text-xs uppercase tracking-wider text-white/40">
                Historique des contributions
              </h2>
              {contributions.length === 0 ? (
                <p className="mt-4 text-sm text-white/40">Aucune contribution enregistrée.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                        <th className="pb-2 font-medium">Année</th>
                        <th className="pb-2 text-right font-medium">Attendu</th>
                        <th className="pb-2 text-right font-medium">Versé</th>
                        <th className="pb-2 text-right font-medium">Valorisé</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {contributions.map((c) => (
                        <tr key={c.id} className="text-white/80">
                          <td className="py-2.5 font-medium text-white">{c.annee}</td>
                          <td className="py-2.5 text-right">{formatFcfa(c.montantAttendu)}</td>
                          <td className="py-2.5 text-right">{formatFcfa(c.montantVerse)}</td>
                          <td className="py-2.5 text-right">{formatFcfa(c.montantValorise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

export default MembreDetailPage
