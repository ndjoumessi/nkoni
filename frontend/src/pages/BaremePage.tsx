import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { baremeApi, ApiError, type Bareme } from '@/lib/api'
import { peutVoirBareme, peutGererBareme } from '@/lib/roles'
import { formatFcfa } from '@/lib/format'

const inputCls =
  'w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30'

/**
 * Barème annuel (§4.2 / §5.3). Lecture : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE.
 * Écriture (création + édition du montant) : ADMIN uniquement. Dernier maillon de la
 * chaîne barème → ouverture d'année → versement, entièrement pilotable depuis l'UI.
 */
export function BaremePage() {
  const { user, accessToken } = useAuth()
  const gestion = peutGererBareme(user?.role)

  const [baremes, setBaremes] = useState<Bareme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [annee, setAnnee] = useState(String(new Date().getFullYear()))
  const [montant, setMontant] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editMontant, setEditMontant] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const list = await baremeApi.list(accessToken, controller.signal)
        if (active) setBaremes(list)
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

  // Autorisation : réservé aux rôles avec Lecture sur BaremeAnnuel.
  if (!peutVoirBareme(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setAddError(null)
    setAdding(true)
    try {
      const cree = await baremeApi.create(Number(annee), Number(montant), accessToken)
      // Réinsertion triée par année décroissante.
      setBaremes((prev) => [cree, ...prev].sort((a, b) => b.annee - a.annee))
      setMontant('')
    } catch (e) {
      // 409 : année déjà configurée → message backend explicite.
      setAddError(e instanceof ApiError ? e.message : 'Échec de l’ajout du barème.')
    } finally {
      setAdding(false)
    }
  }

  const demarrerEdition = (b: Bareme) => {
    setEditError(null)
    setEditId(b.id)
    setEditMontant(String(b.montantAttendu))
  }

  const enregistrerEdition = async (id: string) => {
    if (!accessToken) return
    setEditError(null)
    setSaving(true)
    try {
      const maj = await baremeApi.update(id, Number(editMontant), accessToken)
      setBaremes((prev) => prev.map((b) => (b.id === id ? maj : b)))
      setEditId(null)
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Échec de la mise à jour.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tableau de bord
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Barème annuel</h1>
        <p className="mt-1 text-sm text-white/50">
          Montant attendu par membre pour chaque année.
          {!gestion && ' (lecture seule)'}
        </p>

        {/* Formulaire d'ajout — ADMIN uniquement */}
        {gestion && (
          <form
            onSubmit={handleAdd}
            className="mt-6 rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl"
          >
            <p className="text-xs uppercase tracking-wider text-white/40">Ajouter une année</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs text-white/40">Année</span>
                <input
                  required
                  type="number"
                  min={1900}
                  max={2200}
                  value={annee}
                  onChange={(e) => setAnnee(e.target.value)}
                  className={`${inputCls} mt-1 w-32`}
                />
              </label>
              <label className="block flex-1">
                <span className="text-xs text-white/40">Montant attendu (FCFA)</span>
                <input
                  required
                  type="number"
                  min={0}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className={`${inputCls} mt-1`}
                />
              </label>
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Ajouter
              </button>
            </div>
            {addError && <p className="mt-3 text-sm text-rose-300">{addError}</p>}
          </form>
        )}

        {/* Liste */}
        <div className="mt-6">
          {loading && (
            <div className="flex items-center justify-center py-16 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-200">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.06] backdrop-blur-xl">
              <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-wider text-white/40">
                <span>Année</span>
                <span>Montant attendu</span>
                <span className="sr-only">Actions</span>
              </div>
              {baremes.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-white/40">
                  Aucun barème configuré.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {baremes.map((b) => (
                    <li
                      key={b.id}
                      className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 px-5 py-3.5"
                    >
                      <span className="font-medium text-white">{b.annee}</span>
                      {editId === b.id ? (
                        <input
                          type="number"
                          min={0}
                          value={editMontant}
                          onChange={(e) => setEditMontant(e.target.value)}
                          className={inputCls}
                          aria-label={`Montant ${b.annee}`}
                        />
                      ) : (
                        <span className="text-sm text-white/80">{formatFcfa(b.montantAttendu)}</span>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        {gestion && editId === b.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => enregistrerEdition(b.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-60"
                            >
                              {saving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="inline-flex items-center rounded-full border border-white/15 px-2 py-1 text-xs text-white/60 transition hover:text-white"
                              aria-label="Annuler"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        ) : gestion ? (
                          <button
                            type="button"
                            onClick={() => demarrerEdition(b)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modifier
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {editError && <p className="px-5 py-3 text-sm text-rose-300">{editError}</p>}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default BaremePage
