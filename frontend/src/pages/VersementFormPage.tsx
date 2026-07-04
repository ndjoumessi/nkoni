import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Check, FileText, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  contributionsApi,
  versementsApi,
  recusApi,
  ApiError,
  type Contribution,
  type ModeVersement,
  type Recu,
  type VersementCree,
} from '@/lib/api'
import { peutSaisirVersement, peutOuvrirAnnee } from '@/lib/roles'
import { formatFcfa } from '@/lib/format'

const inputCls =
  'w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30'

const MODES: { value: ModeVersement; label: string }[] = [
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'TIERS', label: 'Tiers' },
  { value: 'AUTRE', label: 'Autre' },
]

const aujourdHui = (): string => new Date().toISOString().slice(0, 10)

/**
 * Saisie d'un versement pour une contribution d'un membre (POST /versements).
 * Réservé ADMIN + TRESORIERE (§2). Après succès : résumé des totaux réajustés + bouton
 * « Générer le reçu » (jamais automatique, §4.6).
 *
 * Si aucune contribution n'existe pour l'année voulue, une action « Ouvrir l'année »
 * (POST /contributions/ouvrir-annee) est proposée en place — sans elle, le formulaire
 * serait inutilisable tant qu'aucune année n'a été ouverte.
 */
export function VersementFormPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const presetContrib = searchParams.get('contributionId') ?? ''
  const [membreNom, setMembreNom] = useState('')
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [contribId, setContribId] = useState(presetContrib)
  const [montant, setMontant] = useState('')
  const [dateVersement, setDateVersement] = useState(aujourdHui())
  const [mode, setMode] = useState<ModeVersement>('ESPECES')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultat, setResultat] = useState<VersementCree | null>(null)

  const [recu, setRecu] = useState<Recu | null>(null)
  const [generatingRecu, setGeneratingRecu] = useState(false)
  const [recuError, setRecuError] = useState<string | null>(null)

  const [anneeAOuvrir, setAnneeAOuvrir] = useState(String(new Date().getFullYear()))
  const [ouvrant, setOuvrant] = useState(false)
  const [ouvrirMsg, setOuvrirMsg] = useState<string | null>(null)
  const [ouvrirErr, setOuvrirErr] = useState<string | null>(null)

  const chargerContributions = useCallback(
    async (signal?: AbortSignal): Promise<Contribution[]> => {
      if (!accessToken || !id) return []
      const list = await contributionsApi.listByMembre(id, accessToken, signal)
      list.sort((a, b) => b.annee - a.annee)
      setContributions(list)
      return list
    },
    [accessToken, id],
  )

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [membre, list] = await Promise.all([
          membresApi.get(id, accessToken, signal),
          chargerContributions(signal),
        ])
        if (!active) return
        setMembreNom(`${membre.nom} ${membre.prenom}`)
        // Présélection : contributionId de l'URL, sinon la plus récente.
        if (!presetContrib && list.length > 0) setContribId(list[0].id)
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
  }, [accessToken, id, chargerContributions, presetContrib])

  // Autorisation : réservé ADMIN + TRESORIERE.
  if (!peutSaisirVersement(user?.role)) {
    return <Navigate to={id ? `/membres/${id}` : '/membres'} replace />
  }

  const handleOuvrirAnnee = async () => {
    if (!accessToken) return
    setOuvrirErr(null)
    setOuvrirMsg(null)
    setOuvrant(true)
    try {
      const res = await contributionsApi.ouvrirAnnee(Number(anneeAOuvrir), accessToken)
      const list = await chargerContributions()
      const nouvelle = list.find((c) => c.annee === res.annee)
      if (nouvelle) setContribId(nouvelle.id)
      setOuvrirMsg(
        `Année ${res.annee} ouverte : ${res.contributionsCreees} contribution(s) créée(s) sur ${res.membresEligibles} membre(s) éligible(s)` +
          (nouvelle ? '.' : ". Ce membre n'est pas éligible pour cette année."),
      )
    } catch (e) {
      setOuvrirErr(
        e instanceof ApiError ? e.message : "Échec de l'ouverture de l'année.",
      )
    } finally {
      setOuvrant(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !contribId) return
    setError(null)
    setSaving(true)
    try {
      const res = await versementsApi.create(
        {
          contributionId: contribId,
          montant: Number(montant),
          dateVersement,
          mode,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        accessToken,
      )
      setResultat(res)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Échec de l’enregistrement du versement.')
    } finally {
      setSaving(false)
    }
  }

  const handleGenererRecu = async () => {
    if (!accessToken || !resultat) return
    setRecuError(null)
    setGeneratingRecu(true)
    try {
      const r = await recusApi.generer(resultat.versement.id, accessToken)
      setRecu(r)
    } catch (e) {
      setRecuError(e instanceof ApiError ? e.message : 'Échec de la génération du reçu.')
    } finally {
      setGeneratingRecu(false)
    }
  }

  const nouveauVersement = () => {
    setResultat(null)
    setRecu(null)
    setMontant('')
    setNote('')
    setDateVersement(aujourdHui())
  }

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link
          to={id ? `/membres/${id}` : '/membres'}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Fiche du membre
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Nouveau versement</h1>
        {membreNom && <p className="mt-1 text-sm text-white/50">{membreNom}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
          </div>
        ) : resultat ? (
          /* --- Résumé après succès --- */
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-6">
              <div className="flex items-center gap-2 text-emerald-200">
                <Check className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-semibold">Versement enregistré</h2>
              </div>
              <p className="mt-3 text-sm text-white/80">
                {formatFcfa(resultat.versement.montant)} · année {resultat.contribution.annee}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-white/40">Total versé</dt>
                  <dd className="mt-1 font-semibold">{formatFcfa(resultat.contribution.montantVerse)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-white/40">Total valorisé</dt>
                  <dd className="mt-1 font-semibold">{formatFcfa(resultat.contribution.montantValorise)}</dd>
                </div>
              </dl>
            </div>

            {/* Génération du reçu — à la demande (§4.6) */}
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
              {recu ? (
                <p className="inline-flex items-center gap-2 text-sm text-emerald-200">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Reçu généré : <span className="font-semibold">{recu.numero}</span>
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleGenererRecu}
                    disabled={generatingRecu}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
                  >
                    {generatingRecu ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    )}
                    Générer le reçu
                  </button>
                  {recuError && <p className="mt-2 text-sm text-rose-300">{recuError}</p>}
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={nouveauVersement}
                className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Nouveau versement
              </button>
              <button
                type="button"
                onClick={() => navigate(`/membres/${id}`)}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
              >
                Retour à la fiche
              </button>
            </div>
          </div>
        ) : (
          /* --- Formulaire --- */
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl"
          >
            {contributions.length === 0 ? (
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Aucune contribution n’existe pour ce membre. Ouvrez d’abord une année
                ci-dessous pour pouvoir enregistrer un versement.
              </p>
            ) : (
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-white/40">Année (contribution) *</span>
                <select
                  required
                  value={contribId}
                  onChange={(e) => setContribId(e.target.value)}
                  className={`${inputCls} mt-1.5`}
                >
                  {contributions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.annee} — versé {formatFcfa(c.montantVerse)} / attendu {formatFcfa(c.montantAttendu)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {contributions.length > 0 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider text-white/40">Montant (FCFA) *</span>
                    <input
                      required
                      type="number"
                      min={1}
                      value={montant}
                      onChange={(e) => setMontant(e.target.value)}
                      className={`${inputCls} mt-1.5`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider text-white/40">Date *</span>
                    <input
                      required
                      type="date"
                      value={dateVersement}
                      onChange={(e) => setDateVersement(e.target.value)}
                      className={`${inputCls} mt-1.5`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider text-white/40">Mode *</span>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as ModeVersement)}
                      className={`${inputCls} mt-1.5`}
                    >
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-white/40">Note (optionnelle)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className={`${inputCls} mt-1.5`}
                  />
                </label>

                {error && (
                  <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
                    {error}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || !contribId}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Enregistrer le versement
                  </button>
                </div>
              </>
            )}

            {/* Ouvrir une année (ADMIN + TRESORIERE) — débloque le cas « année absente ». */}
            {peutOuvrirAnnee(user?.role) && (
              <div className="border-t border-white/10 pt-5">
                <p className="text-xs uppercase tracking-wider text-white/40">Ouvrir une année</p>
                <p className="mt-1 text-xs text-white/40">
                  Crée les contributions de tous les membres éligibles pour l’année (nécessite
                  un barème configuré pour cette année).
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    min={1900}
                    max={2200}
                    value={anneeAOuvrir}
                    onChange={(e) => setAnneeAOuvrir(e.target.value)}
                    className={`${inputCls} w-32`}
                    aria-label="Année à ouvrir"
                  />
                  <button
                    type="button"
                    onClick={handleOuvrirAnnee}
                    disabled={ouvrant}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
                  >
                    {ouvrant ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    )}
                    Ouvrir l’année
                  </button>
                </div>
                {ouvrirMsg && <p className="mt-2 text-sm text-emerald-200">{ouvrirMsg}</p>}
                {ouvrirErr && <p className="mt-2 text-sm text-rose-300">{ouvrirErr}</p>}
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  )
}

export default VersementFormPage
