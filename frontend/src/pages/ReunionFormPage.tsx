import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  ListChecks,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { reunionsApi, ApiError, type TypeReunion } from '@/lib/api'
import { peutGererReunions } from '@/lib/roles'
import { focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { FormSection } from '@/components/ui/FormSection'

interface PointDraft {
  key: string
  titre: string
  notes: string
}

/** Création d'une réunion (§5) avec éditeur d'ordre du jour inline. */
export function ReunionFormPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [date, setDate] = useState('')
  const [lieu, setLieu] = useState('')
  const [type, setType] = useState<TypeReunion>('ORDINAIRE')
  const [points, setPoints] = useState<PointDraft[]>([])
  const [errDate, setErrDate] = useState<string | undefined>(undefined)
  const [errLieu, setErrLieu] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const seq = useRef(0)
  const newKey = () => `p-${seq.current++}`
  const formRef = useRef<HTMLFormElement>(null)

  if (!peutGererReunions(user?.role)) {
    return <Navigate to="/reunions" replace />
  }

  const ajouterPoint = () =>
    setPoints((prev) => [...prev, { key: newKey(), titre: '', notes: '' }])

  const majPoint = (key: string, champ: 'titre' | 'notes', valeur: string) =>
    setPoints((prev) => prev.map((p) => (p.key === key ? { ...p, [champ]: valeur } : p)))

  const supprimerPoint = (key: string) =>
    setPoints((prev) => prev.filter((p) => p.key !== key))

  const deplacer = (index: number, delta: -1 | 1) =>
    setPoints((prev) => {
      const cible = index + delta
      if (cible < 0 || cible >= prev.length) return prev
      const copie = [...prev]
      const [item] = copie.splice(index, 1)
      copie.splice(cible, 0, item)
      return copie
    })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!accessToken) return

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const eDate = date ? undefined : t('reunions.form.dateRequise')
    const eLieu = lieu.trim().length === 0 ? t('reunions.form.lieuRequis') : undefined
    setErrDate(eDate)
    setErrLieu(eLieu)
    if (eDate || eLieu) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }

    // Points : on ignore les lignes au titre vide, mais on refuse une ligne à moitié remplie.
    const pointsValides = points.filter((p) => p.titre.trim().length > 0)
    if (points.some((p) => p.titre.trim().length === 0 && p.notes.trim().length > 0)) {
      setError(t('reunions.form.pointSansTitre'))
      return
    }

    setSubmitting(true)
    try {
      const cree = await reunionsApi.create(
        {
          date: new Date(date).toISOString(),
          lieu: lieu.trim(),
          type,
          pointsOrdreDuJour: pointsValides.map((p) => ({
            titre: p.titre.trim(),
            ...(p.notes.trim() ? { notes: p.notes.trim() } : {}),
          })),
        },
        accessToken,
      )
      toast.success(
        t('reunions.toast.creee'),
        t('reunions.toast.creeeDetail', { n: pointsValides.length }),
      )
      navigate(`/reunions/${cree.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('reunions.form.erreurGenerique'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        overline={t('reunions.overline')}
        title={t('reunions.form.titre')}
        back={{ to: '/reunions', label: t('reunions.detail.retour') }}
      />

      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormSection icon={CalendarRange} title={t('reunions.form.infos')}>
            <Field label={t('reunions.form.dateLabel')} required error={errDate}>
              <Input
                type="datetime-local"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setErrDate(undefined)
                }}
              />
            </Field>
            <Field label={t('reunions.form.typeLabel')} required>
              <Select value={type} onChange={(e) => setType(e.target.value as TypeReunion)}>
                <option value="ORDINAIRE">{t('reunions.types.ORDINAIRE')}</option>
                <option value="EXTRAORDINAIRE">{t('reunions.types.EXTRAORDINAIRE')}</option>
              </Select>
            </Field>
            <Field label={t('reunions.form.lieuLabel')} required error={errLieu} className="sm:col-span-2">
              <Input
                value={lieu}
                onChange={(e) => {
                  setLieu(e.target.value)
                  setErrLieu(undefined)
                }}
                placeholder={t('reunions.form.lieuPlaceholder')}
              />
            </Field>
          </FormSection>

          {/* Éditeur d'ordre du jour */}
          <div className="rounded-2xl border border-hairline bg-surface/40 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-brass" aria-hidden="true" />
                <Overline>{t('reunions.ordreDuJour.titre')}</Overline>
              </div>
              <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={ajouterPoint}>
                {t('reunions.form.ajouterPoint')}
              </Button>
            </div>

            {points.length === 0 ? (
              <p className="mt-4 text-sm text-faint">
                {t('reunions.form.aucunPoint')}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {points.map((p, index) => (
                  <li
                    key={p.key}
                    className="rounded-xl border border-hairline bg-surface-2/50 p-3.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 w-6 shrink-0 text-center text-xs font-semibold text-faint">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={p.titre}
                          onChange={(e) => majPoint(p.key, 'titre', e.target.value)}
                          placeholder={t('reunions.form.pointTitrePlaceholder')}
                          aria-label={t('reunions.form.pointTitreAria', { n: index + 1 })}
                        />
                        <Textarea
                          value={p.notes}
                          onChange={(e) => majPoint(p.key, 'notes', e.target.value)}
                          placeholder={t('reunions.form.pointNotesPlaceholder')}
                          rows={2}
                          aria-label={t('reunions.form.pointNotesAria', { n: index + 1 })}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => deplacer(index, -1)}
                          disabled={index === 0}
                          aria-label={t('reunions.ordreDuJour.monter')}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deplacer(index, 1)}
                          disabled={index === points.length - 1}
                          aria-label={t('reunions.ordreDuJour.descendre')}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => supprimerPoint(p.key)}
                          aria-label={t('reunions.ordreDuJour.supprimer')}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-terra"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button type="submit" icon={Save} loading={submitting}>
              {t('reunions.form.creer')}
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}

export default ReunionFormPage
