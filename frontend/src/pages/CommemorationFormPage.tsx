import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Flame, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
import {
  commemorationsApi,
  ApiError,
  messageErreur,
  type CommemorationMembreRef,
  type StatutCommemoration,
  type TypeCommemoration,
} from '@/lib/api'
import { peutGererCommemorations } from '@/lib/roles'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'

const TYPES: TypeCommemoration[] = ['COMMEMORATION', 'CEREMONIE']
const STATUTS: StatutCommemoration[] = ['PLANIFIEE', 'TENUE', 'ANNULEE']

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Formulaire de commémoration/cérémonie (V2) — création ET édition. */
export function CommemorationFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [titre, setTitre] = useState('')
  const [type, setType] = useState<TypeCommemoration>('COMMEMORATION')
  const [date, setDate] = useState(aujourdHui())
  const [lieu, setLieu] = useState('')
  const [description, setDescription] = useState('')
  const [statut, setStatut] = useState<StatutCommemoration>('PLANIFIEE')
  const [notes, setNotes] = useState('')
  const [membresConcernes, setMembresConcernes] = useState<Set<string>>(new Set())

  const [membres, setMembres] = useState<CommemorationMembreRef[]>([])
  const [loading, setLoading] = useState(editing)
  const [submitting, setSubmitting] = useState(false)
  const [errTitre, setErrTitre] = useState<string | undefined>(undefined)
  const [errDate, setErrDate] = useState<string | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const autorise = peutGererCommemorations(user?.role)

  useEffect(() => {
    if (!accessToken || !autorise) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      const listeMembres = await commemorationsApi
        .membres(accessToken, controller.signal)
        .catch(() => [] as CommemorationMembreRef[])
      if (active) setMembres(listeMembres)

      if (editing && id) {
        try {
          const c = await commemorationsApi.get(id, accessToken, controller.signal)
          if (!active) return
          setTitre(c.titre)
          setType(c.type)
          setDate(c.date.slice(0, 10))
          setLieu(c.lieu ?? '')
          setDescription(c.description ?? '')
          setStatut(c.statut)
          setNotes(c.notes ?? '')
          setMembresConcernes(new Set(c.membresConcernes.map((m) => m.id)))
        } catch (e) {
          if (active) toast.error(t('commemorations.form.toast.chargementImpossible'), messageErreur(e))
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
    return <Navigate to="/commemorations" replace />
  }

  const toggleMembre = (mid: string) => {
    setMembresConcernes((prev) => {
      const next = new Set(prev)
      if (next.has(mid)) next.delete(mid)
      else next.add(mid)
      return next
    })
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return

    // Validation inline + focus sur le 1er champ en erreur (§8).
    const eTitre = titre.trim().length === 0 ? t('commemorations.form.erreurs.titreRequis') : undefined
    const eDate = date ? undefined : t('commemorations.form.erreurs.dateRequise')
    setErrTitre(eTitre)
    setErrDate(eDate)
    if (eTitre || eDate) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }
    setSubmitting(true)
    const payload = {
      titre: titre.trim(),
      type,
      date: new Date(date).toISOString(),
      statut,
      lieu: lieu.trim(),
      description: description.trim(),
      notes: notes.trim(),
      membresConcernes: [...membresConcernes],
    }
    try {
      if (editing && id) {
        // En édition, on envoie aussi les champs vidés (null) pour les effacer.
        await commemorationsApi.update(
          id,
          {
            titre: payload.titre,
            type,
            date: payload.date,
            statut,
            lieu: payload.lieu || null,
            description: payload.description || null,
            notes: payload.notes || null,
            membresConcernes: payload.membresConcernes,
          },
          accessToken,
        )
        toast.success(t('commemorations.form.toast.miseAJour'))
        navigate(`/commemorations/${id}`)
      } else {
        const cree = await commemorationsApi.create(
          {
            titre: payload.titre,
            type,
            date: payload.date,
            statut,
            ...(payload.lieu ? { lieu: payload.lieu } : {}),
            ...(payload.description ? { description: payload.description } : {}),
            ...(payload.notes ? { notes: payload.notes } : {}),
            ...(payload.membresConcernes.length > 0
              ? { membresConcernes: payload.membresConcernes }
              : {}),
          },
          accessToken,
        )
        toast.success(t('commemorations.form.toast.creee'))
        navigate(`/commemorations/${cree.id}`)
      }
    } catch (err) {
      toast.error(t('commemorations.form.toast.enregistrementImpossible'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader overline={t('commemorations.overline')} title={t('commemorations.form.chargementTitre')} back={{ to: '/commemorations', label: t('commemorations.form.retour') }} />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline={t('commemorations.overline')}
        title={editing ? t('commemorations.form.titreEdition') : t('commemorations.form.titreCreation')}
        back={{
          to: editing && id ? `/commemorations/${id}` : '/commemorations',
          label: t('commemorations.form.retour'),
        }}
      />

      <form ref={formRef} onSubmit={soumettre} noValidate className="nk-reveal nk-d2 mt-7 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('commemorations.form.evenement')}</Overline>
          </div>
          <div className="mt-4 space-y-4">
            <Field label={t('commemorations.form.titreLabel')} required error={errTitre}>
              <Input
                autoFocus
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value)
                  setErrTitre(undefined)
                }}
                placeholder={t('commemorations.form.titrePlaceholder')}
                maxLength={300}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('commemorations.form.typeLabel')}>
                <Select value={type} onChange={(e) => setType(e.target.value as TypeCommemoration)}>
                  {TYPES.map((typeValue) => (
                    <option key={typeValue} value={typeValue}>
                      {t(`commemorations.type.${typeValue}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('commemorations.form.dateLabel')} required error={errDate}>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    setErrDate(undefined)
                  }}
                />
              </Field>
              <Field label={t('commemorations.form.statutLabel')}>
                <Select value={statut} onChange={(e) => setStatut(e.target.value as StatutCommemoration)}>
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`commemorations.statut.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('commemorations.form.lieuLabel')} hint={t('commemorations.form.lieuHint')}>
              <Input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder={t('commemorations.form.lieuPlaceholder')} maxLength={300} />
            </Field>
            <Field label={t('commemorations.form.descriptionLabel')} hint={t('commemorations.form.descriptionHint')}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('commemorations.form.descriptionPlaceholder')}
                rows={4}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('commemorations.form.membresHonores')}</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">{t('commemorations.form.membresAide')}</p>
          {membres.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('commemorations.form.aucunMembre')}</p>
          ) : (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-surface-2/40 p-2">
              {membres.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={membresConcernes.has(m.id)}
                    onChange={() => toggleMembre(m.id)}
                    className="h-4 w-4 rounded border-hairline-strong accent-brass"
                  />
                  <span className="text-foreground">
                    {m.prenom} {m.nom}
                  </span>
                </label>
              ))}
            </div>
          )}
          {membresConcernes.size > 0 && (
            <p className="mt-2 text-xs text-faint">
              {t('commemorations.form.membresSelectionnes', { count: membresConcernes.size })}
            </p>
          )}
        </Card>

        <Card className="p-6">
          <Overline>{t('commemorations.form.notes')}</Overline>
          <p className="mt-2 text-sm text-faint">{t('commemorations.form.notesAide')}</p>
          <div className="mt-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('commemorations.form.notesPlaceholder')} rows={3} />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(editing && id ? `/commemorations/${id}` : '/commemorations')}
          >
            {t('commemorations.form.annuler')}
          </Button>
          <Button type="submit" icon={Flame} loading={submitting}>
            {editing ? t('commemorations.form.enregistrer') : t('commemorations.form.creer')}
          </Button>
        </div>
      </form>
    </>
  )
}

export default CommemorationFormPage
