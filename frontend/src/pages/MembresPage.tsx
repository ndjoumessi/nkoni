import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, Search } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { membresApi, ApiError, type MembreStatut, type StatutMembre } from '@/lib/api'
import { estMembreSimple, peutGererMembres } from '@/lib/roles'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'

const STATUTS: { value: StatutMembre; label: string }[] = [
  { value: 'ACTIF', label: 'Actifs' },
  { value: 'INACTIF', label: 'Inactifs' },
  { value: 'DECEDE', label: 'Décédés' },
]

const inputCls =
  'w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30'

/**
 * Liste des membres (ADMIN, PRESIDENT, SECRETAIRE, TRESORIERE, COMMISSAIRE — tous ont
 * Lecture sur Membre). MEMBRE_SIMPLE est redirigé vers sa propre fiche.
 *
 * Le statut de cotisation vient de GET /membres/statuts (calculé en masse côté backend) →
 * une seule requête, pas de N+1 sur GET /membres/:id/statut.
 */
export function MembresPage() {
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [membres, setMembres] = useState<MembreStatut[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [recherche, setRecherche] = useState('')
  const [filtreBranche, setFiltreBranche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')

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
        if (active) setError(e instanceof ApiError ? e.message : 'Erreur de chargement.')
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
      return true
    })
  }, [membres, recherche, filtreBranche, filtreStatut])

  // Pendant la redirection MEMBRE_SIMPLE, on n'affiche pas la liste.
  if (estMembreSimple(user?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0b12] text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Redirection" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tableau de bord
        </Link>

        <header className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
            {membres && (
              <p className="mt-1 text-sm text-white/50">
                {filtres.length} / {membres.length} membre{membres.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
          {peutGererMembres(user?.role) && (
            <Link
              to="/membres/nouveau"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau membre
            </Link>
          )}
        </header>

        {/* Filtres */}
        <div className="mt-6 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
              aria-hidden="true"
            />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher par nom ou prénom…"
              className={`${inputCls} pl-9`}
              aria-label="Rechercher un membre"
            />
          </div>
          <select
            value={filtreBranche}
            onChange={(e) => setFiltreBranche(e.target.value)}
            className={inputCls}
            aria-label="Filtrer par branche"
          >
            <option value="">Toutes les branches</option>
            {branches.map(([id, nom]) => (
              <option key={id} value={id}>
                {nom}
              </option>
            ))}
          </select>
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className={inputCls}
            aria-label="Filtrer par statut"
          >
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Contenu */}
        <div className="mt-6">
          {loading && (
            <div className="flex items-center justify-center py-20 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-200">
              {error}
            </div>
          )}

          {!loading && !error && membres && (
            <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.06] backdrop-blur-xl">
              <div className="hidden grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr] gap-4 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-wider text-white/40 md:grid">
                <span>Membre</span>
                <span>Branche</span>
                <span>Statut</span>
                <span>Cotisation</span>
                <span>Adhésion</span>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {filtres.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/membres/${m.id}`}
                      className="grid grid-cols-2 gap-2 px-5 py-4 transition hover:bg-white/[0.04] focus:outline-none focus-visible:bg-white/[0.06] md:grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr] md:items-center md:gap-4"
                    >
                      <span className="font-medium text-white">
                        {m.nom} <span className="text-white/55">{m.prenom}</span>
                      </span>
                      <span className="text-sm text-white/55">{m.branche?.nom ?? '—'}</span>
                      <span>
                        <StatutMembreBadge statut={m.statut} />
                      </span>
                      <span>
                        <StatutCotisationBadge statut={m.statutCotisation} />
                      </span>
                      <span className="text-sm text-white/55">{m.anneeAdhesion}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {filtres.length === 0 && (
                <p className="px-5 py-12 text-center text-sm text-white/40">
                  Aucun membre ne correspond aux filtres.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default MembresPage
