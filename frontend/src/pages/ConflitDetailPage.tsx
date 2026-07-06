import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import { CalendarRange, CheckCircle2, FileText, ShieldAlert, UserCog, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  conflitsApi,
  ApiError,
  messageErreur,
  type Conflit,
  type StatutConflit,
} from '@/lib/api'
import { peutVoirConflits, peutGererDocument } from '@/lib/roles'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { formatDateFR } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { NiveauBadge, StatutConflitBadge } from '@/components/conflits/ConflitBadges'

const STATUTS: StatutConflit[] = ['OUVERT', 'EN_COURS', 'RESOLU', 'CLOS']

/** Détail d'un conflit (§4.4). L'API ne renvoie que les conflits autorisés (404 sinon). */
export function ConflitDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [conflit, setConflit] = useState<Conflit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [statutSaving, setStatutSaving] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await conflitsApi.get(id, accessToken, controller.signal)
        if (active) {
          setConflit(data)
          setNotes(data.notes ?? '')
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
  }, [accessToken, id])

  if (!peutVoirConflits(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  // Droit de modifier (statut/notes) : ADMIN, auteur, ou responsable de suivi.
  // `user.id` est l'id du compte Utilisateur (= auteurId / responsableSuiviId côté API).
  const peutModifier =
    !!conflit &&
    (user?.role === 'ADMIN' ||
      user?.id === conflit.auteurId ||
      (conflit.responsableSuiviId !== null && user?.id === conflit.responsableSuiviId))

  const erreurMetier = (err: unknown, fallback: string) =>
    toast.error(fallback, err instanceof ApiError ? err.message : t('conflits.detail.toast.reessayez'))

  const changerStatut = async (statut: StatutConflit) => {
    if (!accessToken || !conflit || statut === conflit.statut) return
    setStatutSaving(true)
    try {
      const maj = await conflitsApi.update(conflit.id, { statut }, accessToken)
      setConflit(maj)
      toast.success(t('conflits.detail.toast.statutMaj'), t(`conflits.statut.${statut}`))
    } catch (err) {
      erreurMetier(err, t('conflits.detail.toast.statutImpossible'))
    } finally {
      setStatutSaving(false)
    }
  }

  const enregistrerNotes = async () => {
    if (!accessToken || !conflit) return
    setNotesSaving(true)
    try {
      const maj = await conflitsApi.update(
        conflit.id,
        { notes: notes.trim() ? notes : null },
        accessToken,
      )
      setConflit(maj)
      toast.success(t('conflits.detail.toast.notesEnregistrees'))
    } catch (err) {
      erreurMetier(err, t('conflits.detail.toast.enregistrementImpossible'))
    } finally {
      setNotesSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader overline={t('conflits.overline')} title={t('conflits.detail.titre')} back={{ to: '/conflits', label: t('conflits.detail.retour') }} />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !conflit) {
    return (
      <>
        <PageHeader overline={t('conflits.overline')} title={t('conflits.detail.titre')} back={{ to: '/conflits', label: t('conflits.detail.retour') }} />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? t('conflits.detail.introuvable')}
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline={t('conflits.overline')}
        title={conflit.titre}
        back={{ to: '/conflits', label: t('conflits.detail.retour') }}
        actions={
          <div className="flex items-center gap-2">
            <NiveauBadge niveau={conflit.niveauConfidentialite} />
            <StatutConflitBadge statut={conflit.statut} />
          </div>
        }
      />

      {/* Détails */}
      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('conflits.detail.details')}</Overline>
        </div>
        <p className="mt-4 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-foreground">
          {conflit.description}
        </p>

        <dl className="mt-5 grid gap-4 border-t border-hairline pt-5 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-faint" aria-hidden="true" />
            <dt className="text-muted-foreground">{t('conflits.detail.ouvertLe')}</dt>
            <dd className="text-foreground">{formatDateFR(conflit.dateOuverture)}</dd>
          </div>
          {conflit.dateResolution && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-jade" aria-hidden="true" />
              <dt className="text-muted-foreground">{t('conflits.detail.resoluLe')}</dt>
              <dd className="text-foreground">{formatDateFR(conflit.dateResolution)}</dd>
            </div>
          )}
          {conflit.auteur && (
            <div className="flex min-w-0 items-center gap-2">
              <UserCog className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <dt className="shrink-0 text-muted-foreground">{t('conflits.detail.declarePar')}</dt>
              <dd className="min-w-0 truncate text-foreground" title={conflit.auteur.email}>
                {conflit.auteur.email}
              </dd>
            </div>
          )}
          {conflit.responsableSuivi && (
            <div className="flex min-w-0 items-center gap-2">
              <UserCog className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <dt className="shrink-0 text-muted-foreground">{t('conflits.detail.responsableSuivi')}</dt>
              <dd
                className="min-w-0 truncate text-foreground"
                title={conflit.responsableSuivi.email}
              >
                {conflit.responsableSuivi.email}
              </dd>
            </div>
          )}
        </dl>

        {conflit.membresConcernes.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{t('conflits.detail.membresConcernes')}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {conflit.membresConcernes.map((m) => (
                <Badge key={m.id} tone="neutral" size="sm">
                  {m.prenom} {m.nom}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Suivi & résolution */}
      <Card className="nk-reveal nk-d3 mt-6 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('conflits.detail.suiviResolution')}</Overline>
        </div>

        {peutModifier ? (
          <div className="mt-4 space-y-4">
            <div className="max-w-xs">
              <Field label={t('conflits.detail.statut')}>
                <Select
                  value={conflit.statut}
                  disabled={statutSaving}
                  onChange={(e) => changerStatut(e.target.value as StatutConflit)}
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {t(`conflits.statut.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('conflits.detail.notesSuivi')}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('conflits.detail.notesPlaceholder')}
                rows={5}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="button"
                icon={FileText}
                loading={notesSaving}
                disabled={notes === (conflit.notes ?? '')}
                onClick={enregistrerNotes}
              >
                {t('conflits.detail.enregistrerNotes')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-muted-foreground">
            {conflit.notes?.trim() ? conflit.notes : t('conflits.detail.aucuneNote')}
          </p>
        )}
      </Card>

      {/* Documents rattachés (visibilité héritée du conflit — filtrée côté serveur) */}
      <DocumentsSection
        entiteType="CONFLIT"
        entiteId={conflit.id}
        canManage={peutGererDocument(user?.role, 'CONFLIT')}
      />
    </>
  )
}

export default ConflitDetailPage
