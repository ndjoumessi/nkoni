import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
import {
  conflitsApi,
  membresApi,
  ApiError,
  messageErreur,
  type ConflitUtilisateurRef,
  type MembreStatut,
  type NiveauConfidentialite,
} from '@/lib/api'
import { peutDeclarerConflit } from '@/lib/roles'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { SelecteurMembres } from '@/components/membres/SelecteurMembres'

const NIVEAUX: NiveauConfidentialite[] = ['PUBLIC', 'BUREAU', 'CONFIDENTIEL']

/** Déclaration d'un conflit (§4.4) — réservée ADMIN/PRESIDENT/SECRETAIRE. */
export function ConflitFormPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [niveau, setNiveau] = useState<NiveauConfidentialite>('BUREAU')
  const [responsableSuiviId, setResponsableSuiviId] = useState('')
  const [membresConcernes, setMembresConcernes] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errTitre, setErrTitre] = useState<string | undefined>(undefined)
  const [errDescription, setErrDescription] = useState<string | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [responsables, setResponsables] = useState<ConflitUtilisateurRef[]>([])

  const autorise = peutDeclarerConflit(user?.role)

  useEffect(() => {
    if (!accessToken || !autorise) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      const [m, r] = await Promise.all([
        membresApi.listStatuts(accessToken, controller.signal).catch(() => [] as MembreStatut[]),
        conflitsApi.responsables(accessToken, controller.signal).catch(() => [] as ConflitUtilisateurRef[]),
      ])
      if (active) {
        setMembres(m)
        setResponsables(r)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, autorise])

  const aideNiveau = t(`conflits.form.niveauAide.${niveau}`)

  if (!autorise) {
    return <Navigate to="/conflits" replace />
  }

  const changerNiveau = (n: NiveauConfidentialite) => {
    setNiveau(n)
    // Le responsable de suivi n'est pertinent que pour un conflit CONFIDENTIEL.
    if (n !== 'CONFIDENTIEL') setResponsableSuiviId('')
  }

  const toggleMembre = (id: string) => {
    setMembresConcernes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return

    // Validation inline + focus sur le 1er champ en erreur (§8).
    const eTitre = titre.trim().length === 0 ? t('conflits.form.erreurs.titreRequis') : undefined
    const eDescription =
      description.trim().length === 0 ? t('conflits.form.erreurs.descriptionRequise') : undefined
    setErrTitre(eTitre)
    setErrDescription(eDescription)
    if (eTitre || eDescription) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }
    setSubmitting(true)
    try {
      const cree = await conflitsApi.create(
        {
          titre: titre.trim(),
          description: description.trim(),
          niveauConfidentialite: niveau,
          ...(niveau === 'CONFIDENTIEL' && responsableSuiviId
            ? { responsableSuiviId }
            : {}),
          ...(membresConcernes.size > 0 ? { membresConcernes: [...membresConcernes] } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        accessToken,
      )
      toast.success(t('conflits.form.toast.declare'))
      navigate(`/conflits/${cree.id}`)
    } catch (err) {
      toast.error(t('conflits.form.toast.declarationImpossible'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        overline={t('conflits.overline')}
        title={t('conflits.form.titre')}
        back={{ to: '/conflits', label: t('conflits.detail.retour') }}
      />

      <form ref={formRef} onSubmit={soumettre} noValidate className="nk-reveal nk-d2 mt-7 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('conflits.form.objet')}</Overline>
          </div>
          <div className="mt-4 space-y-4">
            <Field label={t('conflits.form.titreLabel')} required error={errTitre}>
              <Input
                autoFocus
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value)
                  setErrTitre(undefined)
                }}
                placeholder={t('conflits.form.titrePlaceholder')}
                maxLength={300}
              />
            </Field>
            <Field label={t('conflits.form.descriptionLabel')} required error={errDescription}>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setErrDescription(undefined)
                }}
                placeholder={t('conflits.form.descriptionPlaceholder')}
                rows={5}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('conflits.form.confidentialite')}</Overline>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('conflits.form.niveauLabel')} required hint={aideNiveau}>
              <Select value={niveau} onChange={(e) => changerNiveau(e.target.value as NiveauConfidentialite)}>
                {NIVEAUX.map((n) => (
                  <option key={n} value={n}>
                    {t(`conflits.niveau.${n}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {niveau === 'CONFIDENTIEL' && (
              <Field
                label={t('conflits.form.responsableLabel')}
                hint={t('conflits.form.responsableHint')}
              >
                <Select
                  value={responsableSuiviId}
                  onChange={(e) => setResponsableSuiviId(e.target.value)}
                >
                  <option value="">{t('conflits.form.responsableAucun')}</option>
                  {responsables.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.email}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('conflits.form.membresConcernes')}</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">{t('conflits.form.membresAide')}</p>
          {membres.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('conflits.form.aucunMembre')}</p>
          ) : (
            <SelecteurMembres
              membres={membres}
              selection={membresConcernes}
              onToggle={toggleMembre}
            />
          )}
        </Card>

        <Card className="p-6">
          <Overline>{t('conflits.form.notesSuivi')}</Overline>
          <p className="mt-2 text-sm text-faint">{t('conflits.form.notesAide')}</p>
          <div className="mt-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('conflits.form.notesPlaceholder')}
              rows={3}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/conflits')}>
            {t('conflits.form.annuler')}
          </Button>
          <Button type="submit" icon={ShieldAlert} loading={submitting}>
            {t('conflits.form.declarer')}
          </Button>
        </div>
      </form>
    </>
  )
}

export default ConflitFormPage
