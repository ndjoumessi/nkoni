import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Phone, User, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
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
import { soumettreOuEnfiler } from '@/lib/offline-sync'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelecteurAnnee } from '@/components/ui/SelecteurAnnee'
import { FormSection } from '@/components/ui/FormSection'
import { Skeleton } from '@/components/ui/Skeleton'
import { anneeCouranteApp } from '@/lib/date-app'

const STATUTS: StatutMembre[] = ['ACTIF', 'INACTIF', 'DECEDE']

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
  email: string
  adresse: string
  brancheId: string
  chefSousFamilleId: string
  anneeAdhesion: string
  anneeFinContribution: string
}

const VIDE: FormState = {
  nom: '', prenom: '', sexe: '', dateNaissance: '', fonctionSociale: '', statut: 'ACTIF',
  telephone: '', email: '', adresse: '', brancheId: '', chefSousFamilleId: '', anneeAdhesion: '',
  anneeFinContribution: '',
}

type Errors = Partial<Record<keyof FormState, string>>

/**
 * Création et édition d'un membre (même composant, mode déduit de la présence d'un `:id`).
 * Réservé ADMIN + SECRETAIRE (Créer/Modifier §2) — sinon redirection.
 */
export function MembreFormPage() {
  const { t } = useTranslation()
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
  const [errors, setErrors] = useState<Errors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    // Validation inline (§8) : on efface l'erreur d'un champ dès qu'il est retouché.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  /** Contrôles côté client — retourne les erreurs par champ (vide = valide). */
  const valider = (f: FormState): Errors => {
    const errs: Errors = {}
    if (f.nom.trim().length === 0) errs.nom = t('membres.form.validation.nomRequis')
    if (f.prenom.trim().length === 0) errs.prenom = t('membres.form.validation.prenomRequis')
    const annee = Number(f.anneeAdhesion)
    if (f.anneeAdhesion.trim().length === 0)
      errs.anneeAdhesion = t('membres.form.validation.anneeAdhesionRequise')
    else if (!Number.isInteger(annee) || annee < 1900 || annee > 2200)
      errs.anneeAdhesion = t('membres.form.validation.anneeInvalide')
    if (STATUTS_FIN.includes(f.statut) && f.anneeFinContribution.trim().length > 0) {
      const fin = Number(f.anneeFinContribution)
      if (!Number.isInteger(fin) || fin < 1900 || fin > 2200)
        errs.anneeFinContribution = t('membres.form.validation.anneeInvalide')
    }
    return errs
  }

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
              email: membre.email ?? '',
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
        if (active) toast.error(t('membres.form.toast.chargementImpossible'), e instanceof ApiError ? e.message : undefined)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, isEdit, toast, t])

  if (!peutGererMembres(user?.role)) {
    return <Navigate to="/membres" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return

    // Validation inline avant envoi ; focus sur le 1er champ en erreur (§8).
    const errs = valider(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }
    setErrors({})
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
      opt('email', form.email)
      opt('adresse', form.adresse)
      opt('brancheId', form.brancheId)
      opt('chefSousFamilleId', form.chefSousFamilleId)
      if (STATUTS_FIN.includes(form.statut) && form.anneeFinContribution.trim()) {
        payload.anneeFinContribution = Number(form.anneeFinContribution)
      }

      // La MODIFICATION reste en ligne-seulement ; la CRÉATION est optimiste (file hors-ligne).
      if (isEdit && id) {
        const membre = await membresApi.update(id, payload, accessToken)
        toast.success(t('membres.form.toast.miseAJour'), `${membre.nom} ${membre.prenom}`)
        navigate(`/membres/${membre.id}`, { replace: true })
        return
      }
      const { enFile, resultat: membre } = await soumettreOuEnfiler('membre', payload, () =>
        membresApi.create(payload, accessToken),
      )
      if (enFile || !membre) {
        toast.success(t('offline.enFileTitre'), t('offline.enFileDetail'))
        navigate('/membres', { replace: true })
        return
      }
      toast.success(t('membres.form.toast.cree'), `${membre.nom} ${membre.prenom}`)
      navigate(`/membres/${membre.id}`, { replace: true })
    } catch (e) {
      toast.error(
        t('membres.form.toast.enregistrementImpossible'),
        e instanceof ApiError ? e.message : t('membres.form.toast.reessayez'),
      )
    } finally {
      setSaving(false)
    }
  }

  const finVisible = STATUTS_FIN.includes(form.statut)
  const anneeCourante = anneeCouranteApp()
  const backTo = isEdit && id ? `/membres/${id}` : '/membres'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        overline={isEdit ? t('membres.form.overlineModifier') : t('membres.form.overlineNouveau')}
        title={isEdit ? t('membres.form.titreModifier') : t('membres.form.titreNouveau')}
        back={{ to: backTo, label: isEdit ? t('membres.form.backFiche') : t('membres.form.backMembres') }}
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
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
            <FormSection icon={User} title={t('membres.form.section.identite')}>
              <Field label={t('membres.form.champ.nom')} required error={errors.nom}>
                <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} />
              </Field>
              <Field label={t('membres.form.champ.prenom')} required error={errors.prenom}>
                <Input value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </Field>
              <Field label={t('membres.form.champ.sexe')}>
                <Select value={form.sexe} onChange={(e) => set('sexe', e.target.value)}>
                  <option value="">{t('membres.form.champ.tiret')}</option>
                  <option value="M">{t('membres.form.champ.masculin')}</option>
                  <option value="F">{t('membres.form.champ.feminin')}</option>
                </Select>
              </Field>
              <Field label={t('membres.form.champ.dateNaissance')}>
                <DatePicker value={form.dateNaissance} onChange={(v) => set('dateNaissance', v)} />
              </Field>
            </FormSection>

            <FormSection icon={Phone} title={t('membres.form.section.coordonnees')}>
              <Field label={t('membres.form.champ.telephone')}>
                <Input value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
              </Field>
              <Field label={t('membres.form.champ.email')}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder={t('membres.form.champ.emailPlaceholder')}
                />
              </Field>
              <Field label={t('membres.form.champ.adresse')} className="sm:col-span-2">
                <Textarea
                  value={form.adresse}
                  onChange={(e) => set('adresse', e.target.value)}
                  rows={2}
                />
              </Field>
            </FormSection>

            <FormSection icon={Users} title={t('membres.form.section.adhesion')}>
              <Field label={t('membres.form.champ.fonctionSociale')}>
                <Input
                  value={form.fonctionSociale}
                  onChange={(e) => set('fonctionSociale', e.target.value)}
                />
              </Field>
              <Field label={t('membres.form.champ.anneeAdhesion')} required error={errors.anneeAdhesion}>
                {/* Borne haute = année en cours : le backend refuse une adhésion future (§4.1). */}
                <SelecteurAnnee
                  value={form.anneeAdhesion ? Number(form.anneeAdhesion) : null}
                  min={1900}
                  max={anneeCourante}
                  onChange={(a) => set('anneeAdhesion', a === null ? '' : String(a))}
                />
              </Field>
              <Field label={t('membres.form.champ.statut')}>
                <Select
                  value={form.statut}
                  onChange={(e) => set('statut', e.target.value as StatutMembre)}
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`membres.form.statutOptions.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('membres.form.champ.brancheFamiliale')}>
                <Select value={form.brancheId} onChange={(e) => set('brancheId', e.target.value)}>
                  <option value="">{t('membres.form.champ.tiret')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('membres.form.champ.chefSousFamille')}>
                <Select
                  value={form.chefSousFamilleId}
                  onChange={(e) => set('chefSousFamilleId', e.target.value)}
                >
                  <option value="">{t('membres.form.champ.tiret')}</option>
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
                  label={t('membres.form.champ.anneeFinContribution')}
                  hint={t('membres.form.champ.anneeFinHint')}
                  error={errors.anneeFinContribution}
                >
                  {/* Optionnel : laissé vide (« — ») = renseigné automatiquement par le backend (§4.1). */}
                  <SelecteurAnnee
                    value={form.anneeFinContribution ? Number(form.anneeFinContribution) : null}
                    min={1900}
                    max={anneeCourante}
                    optionnel
                    onChange={(a) => set('anneeFinContribution', a === null ? '' : String(a))}
                  />
                </Field>
              )}
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <ButtonLink to={backTo} variant="ghost">
                {t('membres.form.annuler')}
              </ButtonLink>
              <Button type="submit" loading={saving}>
                {isEdit ? t('membres.form.enregistrer') : t('membres.form.creer')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}

export default MembreFormPage
