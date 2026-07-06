import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  History,
  Landmark,
  Pencil,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  fonctionsApi,
  affectationsApi,
  membresApi,
  ApiError,
  messageErreur,
  type FonctionDetail,
  type Affectation,
  type MembreStatut,
} from '@/lib/api'
import { peutVoirFonctions, peutGererFonctions, peutSupprimerFonction } from '@/lib/roles'
import { formatDateFR, focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'

/** Nom affichable d'un membre (« Prénom Nom »). */
function nomMembre(m?: { nom: string; prenom: string }): string {
  return m ? `${m.prenom} ${m.nom}` : '—'
}

/** Date du jour au format input date (YYYY-MM-DD). */
function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Détail d'une fonction (§5) : titulaire actuel, nomination (clôture auto), historique. */
export function FonctionDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const gestion = peutGererFonctions(user?.role)
  const peutSupprimer = peutSupprimerFonction(user?.role)

  const [fonction, setFonction] = useState<FonctionDetail | null>(null)
  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Édition de la fonction (nom / description).
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [savingFonction, setSavingFonction] = useState(false)
  const [errNom, setErrNom] = useState<string | undefined>(undefined)
  const editFormRef = useRef<HTMLFormElement>(null)

  // Formulaire de nomination.
  const [membreId, setMembreId] = useState('')
  const [dateDebut, setDateDebut] = useState(aujourdHui())
  const [notes, setNotes] = useState('')
  const [nominating, setNominating] = useState(false)
  const [errMembre, setErrMembre] = useState<string | undefined>(undefined)
  const [errDate, setErrDate] = useState<string | undefined>(undefined)
  const nomFormRef = useRef<HTMLFormElement>(null)

  // Suppression.
  const [deleteOuvert, setDeleteOuvert] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await fonctionsApi.get(id, accessToken, controller.signal)
        if (!active) return
        setFonction(data)
        setNom(data.nom)
        setDescription(data.description ?? '')
        // Liste des membres pour le sélecteur de titulaire (réservé aux gestionnaires).
        if (gestion) {
          const liste = await membresApi
            .listStatuts(accessToken, controller.signal)
            .catch(() => [] as MembreStatut[])
          if (active) setMembres(liste)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, gestion])

  if (!peutVoirFonctions(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const erreurMetier = (err: unknown, fallback: string) =>
    toast.error(fallback, err instanceof ApiError ? err.message : t('fonctions.toast.reessayer'))

  const recharger = async () => {
    if (!accessToken || !id) return
    const data = await fonctionsApi.get(id, accessToken)
    setFonction(data)
  }

  const enregistrerFonction = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !fonction) return
    const eNom = nom.trim().length === 0 ? t('fonctions.edit.nomRequis') : undefined
    setErrNom(eNom)
    if (eNom) {
      requestAnimationFrame(() => focusPremierChampInvalide(editFormRef.current))
      return
    }
    setSavingFonction(true)
    try {
      const maj = await fonctionsApi.update(
        fonction.id,
        { nom: nom.trim(), description: description.trim() ? description.trim() : null },
        accessToken,
      )
      setFonction({ ...fonction, nom: maj.nom, description: maj.description })
      toast.success(t('fonctions.toast.majSucces'))
    } catch (err) {
      erreurMetier(err, t('fonctions.toast.majImpossible')) // 409 possible (nom déjà utilisé)
    } finally {
      setSavingFonction(false)
    }
  }

  const nommer = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !fonction) return
    const eMembre = membreId ? undefined : t('affectations.form.membreRequis')
    const eDate = dateDebut ? undefined : t('affectations.form.dateRequise')
    setErrMembre(eMembre)
    setErrDate(eDate)
    if (eMembre || eDate) {
      requestAnimationFrame(() => focusPremierChampInvalide(nomFormRef.current))
      return
    }
    setNominating(true)
    try {
      await affectationsApi.create(
        {
          fonctionId: fonction.id,
          membreId,
          dateDebut: new Date(dateDebut).toISOString(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        accessToken,
      )
      await recharger()
      setMembreId('')
      setDateDebut(aujourdHui())
      setNotes('')
      toast.success(t('affectations.toast.nomme'), t('affectations.toast.nommeDetail'))
    } catch (err) {
      // Erreurs métier possibles : 400 (date incohérente), 404 (membre/fonction introuvable).
      erreurMetier(err, t('affectations.toast.nominationImpossible'))
    } finally {
      setNominating(false)
    }
  }

  const supprimer = async () => {
    if (!accessToken || !fonction) return
    setDeleting(true)
    try {
      await fonctionsApi.remove(fonction.id, accessToken)
      toast.success(t('fonctions.toast.supprimee'), fonction.nom)
      navigate('/fonctions')
    } catch (err) {
      erreurMetier(err, t('fonctions.toast.suppressionImpossible'))
      setDeleting(false)
      setDeleteOuvert(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          overline={t('fonctions.overline')}
          title={t('fonctions.detail.titre')}
          back={{ to: '/fonctions', label: t('fonctions.detail.retour') }}
        />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !fonction) {
    return (
      <>
        <PageHeader
          overline={t('fonctions.overline')}
          title={t('fonctions.detail.titre')}
          back={{ to: '/fonctions', label: t('fonctions.detail.retour') }}
        />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? t('fonctions.detail.introuvable')}
        </Card>
      </>
    )
  }

  const active = fonction.affectations.find((a) => a.dateFin === null)
  const fonctionInchangee =
    nom.trim() === fonction.nom && (description.trim() || null) === (fonction.description ?? null)

  return (
    <>
      <PageHeader
        overline={t('fonctions.overline')}
        title={fonction.nom}
        description={fonction.description ?? undefined}
        back={{ to: '/fonctions', label: t('fonctions.detail.retour') }}
        actions={
          peutSupprimer && (
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={() => setDeleteOuvert(true)}
            >
              {t('fonctions.actions.supprimer')}
            </Button>
          )
        }
      />

      {/* Titulaire actuel */}
      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('fonctions.detail.titulaireActuel')}</Overline>
        </div>
        {active ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="jade" size="lg" dot>
              {nomMembre(active.membre)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t('fonctions.detail.enFonctionDepuis', { date: formatDateFR(active.dateDebut) })}
            </span>
          </div>
        ) : (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserX className="h-4 w-4 text-faint" aria-hidden="true" />
            {t('fonctions.detail.vacante')}
          </p>
        )}
      </Card>

      {/* Nommer un titulaire */}
      {gestion && (
        <Card className="nk-reveal nk-d2 mt-6 p-6">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('affectations.form.titre')}</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">
            {active
              ? t('affectations.form.hintActif')
              : t('affectations.form.hintVacant')}
          </p>
          <form ref={nomFormRef} onSubmit={nommer} noValidate className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('affectations.form.membreLabel')} required error={errMembre}>
                <Select
                  value={membreId}
                  onChange={(e) => {
                    setMembreId(e.target.value)
                    setErrMembre(undefined)
                  }}
                >
                  <option value="">{t('affectations.form.choisirMembre')}</option>
                  {membres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('affectations.form.dateLabel')} required error={errDate}>
                <Input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => {
                    setDateDebut(e.target.value)
                    setErrDate(undefined)
                  }}
                />
              </Field>
            </div>
            <Field label={t('affectations.form.notesLabel')} hint={t('affectations.form.notesHint')}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('affectations.form.notesPlaceholder')}
                rows={2}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={UserPlus} loading={nominating}>
                {t('affectations.form.soumettre')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Historique des nominations */}
      <Card className="nk-reveal nk-d3 mt-6 p-6">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('affectations.historique.titre')}</Overline>
        </div>

        {fonction.affectations.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={t('affectations.historique.vide.titre')}
            className="mt-4"
            description={
              gestion
                ? t('affectations.historique.vide.descriptionGestion')
                : t('affectations.historique.vide.description')
            }
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {fonction.affectations.map((a: Affectation) => {
              const enCours = a.dateFin === null
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/40 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{nomMembre(a.membre)}</span>
                      {enCours ? (
                        <Badge tone="jade" size="sm" dot>
                          {t('affectations.enCours')}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          {t('affectations.cloturee')}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateFR(a.dateDebut)} →{' '}
                      {a.dateFin ? formatDateFR(a.dateFin) : t('affectations.enCoursMinuscule')}
                    </p>
                    {a.notes && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-pretty text-sm text-faint">
                        {a.notes}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Édition de la fonction */}
      {gestion && (
        <Card className="nk-reveal nk-d3 mt-6 p-6">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('fonctions.edit.titre')}</Overline>
          </div>
          <form ref={editFormRef} onSubmit={enregistrerFonction} noValidate className="mt-4 space-y-3">
            <Field label={t('fonctions.edit.nomLabel')} required error={errNom}>
              <Input
                value={nom}
                onChange={(e) => {
                  setNom(e.target.value)
                  setErrNom(undefined)
                }}
                maxLength={200}
              />
            </Field>
            <Field label={t('fonctions.edit.descriptionLabel')} hint={t('fonctions.champ.optionnel')}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={Pencil} loading={savingFonction} disabled={fonctionInchangee}>
                {t('fonctions.edit.enregistrer')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {deleteOuvert && (
        <Modal open onClose={() => setDeleteOuvert(false)} title={t('fonctions.suppression.titre')}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('fonctions.suppression.avant')}
            <span className="font-medium text-foreground">{fonction.nom}</span>
            {t('fonctions.suppression.entre')}
            <span className="font-medium text-foreground">
              {t('fonctions.suppression.emphaseHistorique')}
            </span>
            {t('fonctions.suppression.apres')}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteOuvert(false)}>
              {t('fonctions.actions.annuler')}
            </Button>
            <Button type="button" variant="danger" icon={Trash2} loading={deleting} onClick={supprimer}>
              {t('fonctions.suppression.confirmer')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default FonctionDetailPage
