import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
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
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'

const STATUTS: { value: StatutMembre; label: string }[] = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'INACTIF', label: 'Inactif' },
  { value: 'DECEDE', label: 'Décédé' },
]

/** Statuts qui figent la fin de contribution (§4.1) → champ anneeFinContribution visible. */
const STATUTS_FIN: StatutMembre[] = ['DECEDE', 'INACTIF']

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
  const toast = useToast()

  const [form, setForm] = useState<FormState>(VIDE)
  const [branches, setBranches] = useState<Branche[]>([])
  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        if (active) toast.error('Chargement impossible', e instanceof ApiError ? e.message : undefined)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, isEdit, toast])

  if (!peutGererMembres(user?.role)) {
    return <Navigate to="/membres" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
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
      if (STATUTS_FIN.includes(form.statut) && form.anneeFinContribution.trim()) {
        payload.anneeFinContribution = Number(form.anneeFinContribution)
      }

      const membre =
        isEdit && id
          ? await membresApi.update(id, payload, accessToken)
          : await membresApi.create(payload, accessToken)

      toast.success(isEdit ? 'Membre mis à jour' : 'Membre créé', `${membre.nom} ${membre.prenom}`)
      navigate(`/membres/${membre.id}`, { replace: true })
    } catch (e) {
      toast.error(
        'Enregistrement impossible',
        e instanceof ApiError ? e.message : 'Réessayez plus tard.',
      )
    } finally {
      setSaving(false)
    }
  }

  const finVisible = STATUTS_FIN.includes(form.statut)
  const backTo = isEdit && id ? `/membres/${id}` : '/membres'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        overline={isEdit ? 'Modifier' : 'Nouveau'}
        title={isEdit ? 'Modifier le membre' : 'Nouveau membre'}
        back={{ to: backTo, label: isEdit ? 'Fiche du membre' : 'Membres' }}
      />

      {loading ? (
        <Card className="mt-7 space-y-4 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </Card>
      ) : (
        <Card className="nk-reveal nk-d2 mt-7 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nom" required>
                <Input required value={form.nom} onChange={(e) => set('nom', e.target.value)} />
              </Field>
              <Field label="Prénom" required>
                <Input required value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </Field>
              <Field label="Sexe">
                <Select value={form.sexe} onChange={(e) => set('sexe', e.target.value)}>
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </Select>
              </Field>
              <Field label="Date de naissance">
                <Input
                  type="date"
                  value={form.dateNaissance}
                  onChange={(e) => set('dateNaissance', e.target.value)}
                />
              </Field>
              <Field label="Fonction sociale">
                <Input
                  value={form.fonctionSociale}
                  onChange={(e) => set('fonctionSociale', e.target.value)}
                />
              </Field>
              <Field label="Année d'adhésion" required>
                <Input
                  required
                  type="number"
                  min={1900}
                  max={2200}
                  value={form.anneeAdhesion}
                  onChange={(e) => set('anneeAdhesion', e.target.value)}
                />
              </Field>
              <Field label="Téléphone">
                <Input value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
              </Field>
              <Field label="Statut">
                <Select
                  value={form.statut}
                  onChange={(e) => set('statut', e.target.value as StatutMembre)}
                >
                  {STATUTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Branche familiale">
                <Select value={form.brancheId} onChange={(e) => set('brancheId', e.target.value)}>
                  <option value="">—</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Chef de sous-famille">
                <Select
                  value={form.chefSousFamilleId}
                  onChange={(e) => set('chefSousFamilleId', e.target.value)}
                >
                  <option value="">—</option>
                  {membres
                    .filter((m) => m.id !== id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom} {m.prenom}
                      </option>
                    ))}
                </Select>
              </Field>
              {finVisible && (
                <Field
                  label="Année de fin de contribution"
                  hint="Laissé vide = renseigné automatiquement à l'année en cours."
                >
                  <Input
                    type="number"
                    min={1900}
                    max={2200}
                    value={form.anneeFinContribution}
                    onChange={(e) => set('anneeFinContribution', e.target.value)}
                  />
                </Field>
              )}
            </div>

            <Field label="Adresse">
              <Textarea
                value={form.adresse}
                onChange={(e) => set('adresse', e.target.value)}
                rows={2}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-2">
              <ButtonLink to={backTo} variant="ghost">
                Annuler
              </ButtonLink>
              <Button type="submit" loading={saving}>
                {isEdit ? 'Enregistrer' : 'Créer le membre'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}

export default MembreFormPage
