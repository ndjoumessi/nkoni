import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  branchesApi,
  ApiError,
  type Branche,
  type MembreInput,
  type MembreStatut,
  type StatutMembre,
} from '@/lib/api'
import { peutGererMembres } from '@/lib/roles'

const inputCls =
  'w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30'

const STATUTS: { value: StatutMembre; label: string }[] = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'INACTIF', label: 'Inactif' },
  { value: 'DECEDE', label: 'Décédé' },
]

/** Statuts qui figent la fin de contribution (§4.1) → champ anneeFinContribution visible. */
const STATUTS_FIN: StatutMembre[] = ['DECEDE', 'INACTIF']

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-white/40">{hint}</span>}
    </label>
  )
}

interface FormState {
  nom: string
  prenom: string
  sexe: string
  dateNaissance: string
  fonctionSociale: string
  statut: StatutMembre
  telephone: string
  adresse: string
  brancheId: string
  chefSousFamilleId: string
  anneeAdhesion: string
  anneeFinContribution: string
}

const VIDE: FormState = {
  nom: '', prenom: '', sexe: '', dateNaissance: '', fonctionSociale: '', statut: 'ACTIF',
  telephone: '', adresse: '', brancheId: '', chefSousFamilleId: '', anneeAdhesion: '',
  anneeFinContribution: '',
}

/**
 * Création et édition d'un membre (même composant, mode déduit de la présence d'un `:id`).
 * Réservé ADMIN + SECRETAIRE (Créer/Modifier §2) — sinon redirection.
 */
export function MembreFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(VIDE)
  const [branches, setBranches] = useState<Branche[]>([])
  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const [b, m] = await Promise.all([
          branchesApi.list(accessToken, signal),
          membresApi.listStatuts(accessToken, signal),
        ])
        if (active) {
          setBranches(b)
          setMembres(m)
        }
        if (isEdit && id) {
          const membre = await membresApi.get(id, accessToken, signal)
          if (active) {
            setForm({
              nom: membre.nom,
              prenom: membre.prenom,
              sexe: membre.sexe ?? '',
              dateNaissance: membre.dateNaissance ? membre.dateNaissance.slice(0, 10) : '',
              fonctionSociale: membre.fonctionSociale ?? '',
              statut: membre.statut,
              telephone: membre.telephone ?? '',
              adresse: membre.adresse ?? '',
              brancheId: membre.brancheId ?? '',
              chefSousFamilleId: membre.chefSousFamilleId ?? '',
              anneeAdhesion: String(membre.anneeAdhesion),
              anneeFinContribution: membre.anneeFinContribution
                ? String(membre.anneeFinContribution)
                : '',
            })
          }
        }
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
  }, [accessToken, id, isEdit])

  // Autorisation : réservé ADMIN + SECRETAIRE.
  if (!peutGererMembres(user?.role)) {
    return <Navigate to="/membres" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setError(null)
    setSaving(true)
    try {
      const payload: MembreInput = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        anneeAdhesion: Number(form.anneeAdhesion),
        statut: form.statut,
      }
      const champs = payload as unknown as Record<string, unknown>
      const opt = (k: keyof MembreInput, v: string) => {
        if (v.trim()) champs[k] = v.trim()
      }
      opt('sexe', form.sexe)
      opt('dateNaissance', form.dateNaissance)
      opt('fonctionSociale', form.fonctionSociale)
      opt('telephone', form.telephone)
      opt('adresse', form.adresse)
      opt('brancheId', form.brancheId)
      opt('chefSousFamilleId', form.chefSousFamilleId)
      // Fin de contribution : uniquement si statut concerné et valeur saisie ; sinon le
      // backend la renseigne automatiquement à l'année courante.
      if (STATUTS_FIN.includes(form.statut) && form.anneeFinContribution.trim()) {
        payload.anneeFinContribution = Number(form.anneeFinContribution)
      }

      const membre =
        isEdit && id
          ? await membresApi.update(id, payload, accessToken)
          : await membresApi.create(payload, accessToken)

      navigate(`/membres/${membre.id}`, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Échec de l’enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const finVisible = STATUTS_FIN.includes(form.statut)

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          to={isEdit && id ? `/membres/${id}` : '/membres'}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {isEdit ? 'Fiche du membre' : 'Membres'}
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {isEdit ? 'Modifier le membre' : 'Nouveau membre'}
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5 rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur-xl"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nom *">
                <input
                  required
                  value={form.nom}
                  onChange={(e) => set('nom', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Prénom *">
                <input
                  required
                  value={form.prenom}
                  onChange={(e) => set('prenom', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Sexe">
                <select
                  value={form.sexe}
                  onChange={(e) => set('sexe', e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </Field>
              <Field label="Date de naissance">
                <input
                  type="date"
                  value={form.dateNaissance}
                  onChange={(e) => set('dateNaissance', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Fonction sociale">
                <input
                  value={form.fonctionSociale}
                  onChange={(e) => set('fonctionSociale', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Année d’adhésion *">
                <input
                  required
                  type="number"
                  min={1900}
                  max={2200}
                  value={form.anneeAdhesion}
                  onChange={(e) => set('anneeAdhesion', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Téléphone">
                <input
                  value={form.telephone}
                  onChange={(e) => set('telephone', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Statut">
                <select
                  value={form.statut}
                  onChange={(e) => set('statut', e.target.value as StatutMembre)}
                  className={inputCls}
                >
                  {STATUTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Branche familiale">
                <select
                  value={form.brancheId}
                  onChange={(e) => set('brancheId', e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Chef de sous-famille">
                <select
                  value={form.chefSousFamilleId}
                  onChange={(e) => set('chefSousFamilleId', e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {membres
                    .filter((m) => m.id !== id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom} {m.prenom}
                      </option>
                    ))}
                </select>
              </Field>
              {finVisible && (
                <Field
                  label="Année de fin de contribution"
                  hint="Laissé vide = renseigné automatiquement à l’année en cours."
                >
                  <input
                    type="number"
                    min={1900}
                    max={2200}
                    value={form.anneeFinContribution}
                    onChange={(e) => set('anneeFinContribution', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              )}
            </div>

            <Field label="Adresse">
              <textarea
                value={form.adresse}
                onChange={(e) => set('adresse', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-200">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                to={isEdit && id ? `/membres/${id}` : '/membres'}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
              >
                Annuler
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isEdit ? 'Enregistrer' : 'Créer le membre'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

export default MembreFormPage
