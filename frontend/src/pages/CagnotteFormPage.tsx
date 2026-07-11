import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { HeartHandshake } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
import {
  cagnottesApi,
  membresApi,
  ApiError,
  messageErreur,
  type CagnotteInput,
  type MembreStatut,
  type TypeCagnotte,
} from '@/lib/api'
import { peutGererCagnotte } from '@/lib/roles'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'

const TYPES: TypeCagnotte[] = ['DEUIL', 'MARIAGE', 'NAISSANCE', 'AUTRE']
type BeneficiaireMode = 'aucun' | 'membre' | 'nom'

/** Formulaire de cagnotte d'événement (§4.9) — création ET édition. */
export function CagnotteFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [titre, setTitre] = useState('')
  const [type, setType] = useState<TypeCagnotte>('DEUIL')
  const [description, setDescription] = useState('')
  const [objectif, setObjectif] = useState('')
  const [dateEvenement, setDateEvenement] = useState('')
  const [benefMode, setBenefMode] = useState<BeneficiaireMode>('aucun')
  const [benefMembreId, setBenefMembreId] = useState('')
  const [benefNom, setBenefNom] = useState('')

  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(editing)
  const [submitting, setSubmitting] = useState(false)
  const [errTitre, setErrTitre] = useState<string | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const autorise = peutGererCagnotte(user?.role)

  useEffect(() => {
    if (!accessToken || !autorise) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      const liste = await membresApi
        .listStatuts(accessToken, controller.signal)
        .catch(() => [] as MembreStatut[])
      if (active) setMembres(liste)

      if (editing && id) {
        try {
          const c = await cagnottesApi.get(id, accessToken, controller.signal)
          if (!active) return
          setTitre(c.titre)
          setType(c.type)
          setDescription(c.description ?? '')
          setObjectif(c.objectif != null ? String(c.objectif) : '')
          setDateEvenement(c.dateEvenement ? c.dateEvenement.slice(0, 10) : '')
          if (c.beneficiaireMembreId) {
            setBenefMode('membre')
            setBenefMembreId(c.beneficiaireMembreId)
          } else if (c.beneficiaireNom) {
            setBenefMode('nom')
            setBenefNom(c.beneficiaireNom)
          }
        } catch (e) {
          if (active) toast.error(t('cagnottes.form.toast.erreur'), messageErreur(e))
        } finally {
          if (active) setLoading(false)
        }
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, autorise, editing, id, toast, t])

  if (!autorise) {
    return <Navigate to="/cagnottes" replace />
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    const eTitre = titre.trim().length === 0 ? t('cagnottes.form.validationTitre') : undefined
    setErrTitre(eTitre)
    if (eTitre) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }
    setSubmitting(true)

    const objectifNum = objectif.trim() ? Math.max(0, Math.round(Number(objectif))) : undefined
    const base: CagnotteInput = { titre: titre.trim(), type }
    if (description.trim()) base.description = description.trim()
    if (objectifNum && objectifNum > 0) base.objectif = objectifNum
    if (dateEvenement) base.dateEvenement = new Date(dateEvenement).toISOString()
    if (benefMode === 'membre' && benefMembreId) base.beneficiaireMembreId = benefMembreId
    if (benefMode === 'nom' && benefNom.trim()) base.beneficiaireNom = benefNom.trim()

    try {
      if (editing && id) {
        // En édition, envoyer aussi les champs vidés pour pouvoir les effacer.
        await cagnottesApi.update(
          id,
          {
            titre: base.titre,
            type,
            description: description.trim() || undefined,
            objectif: objectifNum && objectifNum > 0 ? objectifNum : undefined,
            dateEvenement: dateEvenement ? new Date(dateEvenement).toISOString() : undefined,
            beneficiaireMembreId: benefMode === 'membre' ? benefMembreId || undefined : '',
            beneficiaireNom: benefMode === 'nom' ? benefNom.trim() || undefined : '',
          },
          accessToken,
        )
        toast.success(t('cagnottes.form.toast.miseAJour'))
        navigate(`/cagnottes/${id}`)
      } else {
        const cree = await cagnottesApi.create(base, accessToken)
        toast.success(t('cagnottes.form.toast.cree'))
        navigate(`/cagnottes/${cree.id}`)
      }
    } catch (err) {
      toast.error(
        t('cagnottes.form.toast.erreur'),
        err instanceof ApiError ? err.message : messageErreur(err),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          overline={t('cagnottes.form.overlineModifier')}
          title={t('cagnottes.form.titreModifier')}
          back={{ to: '/cagnottes', label: t('cagnottes.form.back') }}
        />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline={editing ? t('cagnottes.form.overlineModifier') : t('cagnottes.form.overlineNouveau')}
        title={editing ? t('cagnottes.form.titreModifier') : t('cagnottes.form.titreNouveau')}
        back={{ to: editing && id ? `/cagnottes/${id}` : '/cagnottes', label: t('cagnottes.form.back') }}
      />

      <form ref={formRef} onSubmit={soumettre} noValidate className="nk-reveal nk-d2 mt-7 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('cagnottes.liste.titre')}</Overline>
          </div>
          <div className="mt-4 space-y-4">
            <Field label={t('cagnottes.form.champTitre')} required error={errTitre}>
              <Input
                autoFocus
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value)
                  setErrTitre(undefined)
                }}
                placeholder={t('cagnottes.form.champTitrePlaceholder')}
                maxLength={200}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('cagnottes.form.champType')}>
                <Select value={type} onChange={(e) => setType(e.target.value as TypeCagnotte)}>
                  {TYPES.map((tv) => (
                    <option key={tv} value={tv}>
                      {t(`cagnottes.types.${tv}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('cagnottes.form.champDate')}>
                <DatePicker value={dateEvenement} onChange={setDateEvenement} />
              </Field>
            </div>
            <Field label={t('cagnottes.form.champObjectif')} hint={t('cagnottes.form.champObjectifHint')}>
              <Input
                inputMode="numeric"
                value={objectif}
                onChange={(e) => setObjectif(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label={t('cagnottes.form.champDescription')}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-4">
            <Field label={t('cagnottes.form.champBeneficiaire')}>
              <Select value={benefMode} onChange={(e) => setBenefMode(e.target.value as BeneficiaireMode)}>
                <option value="aucun">{t('cagnottes.form.beneficiaireAucun')}</option>
                <option value="membre">{t('cagnottes.form.beneficiaireMembre')}</option>
                <option value="nom">{t('cagnottes.form.beneficiaireNom')}</option>
              </Select>
            </Field>
            {benefMode === 'membre' && (
              <Field label={t('cagnottes.form.beneficiaireMembre')}>
                <Select value={benefMembreId} onChange={(e) => setBenefMembreId(e.target.value)}>
                  <option value="">—</option>
                  {membres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {benefMode === 'nom' && (
              <Field label={t('cagnottes.form.beneficiaireNom')}>
                <Input
                  value={benefNom}
                  onChange={(e) => setBenefNom(e.target.value)}
                  placeholder={t('cagnottes.form.beneficiaireNomPlaceholder')}
                  maxLength={200}
                />
              </Field>
            )}
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(editing && id ? `/cagnottes/${id}` : '/cagnottes')}
          >
            {t('cagnottes.form.annuler')}
          </Button>
          <Button type="submit" icon={HeartHandshake} loading={submitting}>
            {editing ? t('cagnottes.form.enregistrer') : t('cagnottes.form.creer')}
          </Button>
        </div>
      </form>
    </>
  )
}

export default CagnotteFormPage
