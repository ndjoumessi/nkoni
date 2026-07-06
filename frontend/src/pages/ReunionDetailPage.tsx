import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  FileText,
  Gavel,
  ListChecks,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  reunionsApi,
  resolutionsApi,
  ApiError,
  messageErreur,
  type ReunionDetail,
  type Resolution,
  type StatutReunion,
  type StatutResolution,
} from '@/lib/api'
import {
  peutVoirReunions,
  peutGererReunions,
  peutSupprimerReunion,
  peutGererDocument,
} from '@/lib/roles'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { formatDateFR, focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  StatutReunionBadge,
  StatutResolutionBadge,
  TypeReunionBadge,
} from '@/components/reunions/StatutBadges'

const STATUTS_REUNION: StatutReunion[] = ['PLANIFIEE', 'TENUE', 'ANNULEE']

const STATUTS_RESOLUTION: StatutResolution[] = ['ADOPTEE', 'REJETEE', 'REPORTEE']

/** Détail d'une réunion (§5) : infos + statut, compte-rendu, ordre du jour, résolutions. */
export function ReunionDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const gestion = peutGererReunions(user?.role)
  const peutSupprimer = peutSupprimerReunion(user?.role)

  const [reunion, setReunion] = useState<ReunionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Compte-rendu (édition).
  const [compteRendu, setCompteRendu] = useState('')
  const [crSaving, setCrSaving] = useState(false)

  // Statut / actions ponctuelles.
  const [statutSaving, setStatutSaving] = useState(false)
  const [pointPending, setPointPending] = useState<string | null>(null)
  const [reorderPending, setReorderPending] = useState(false)

  // Ajout d'un point.
  const [nouveauPoint, setNouveauPoint] = useState('')
  const [addingPoint, setAddingPoint] = useState(false)
  const [errPoint, setErrPoint] = useState<string | undefined>(undefined)
  const pointFormRef = useRef<HTMLFormElement>(null)

  // Formulaire résolution.
  const [resTexte, setResTexte] = useState('')
  const [resStatut, setResStatut] = useState<StatutResolution>('ADOPTEE')
  const [resPointId, setResPointId] = useState('')
  const [resSubmitting, setResSubmitting] = useState(false)
  const [resPending, setResPending] = useState<string | null>(null)
  const [errRes, setErrRes] = useState<string | undefined>(undefined)
  const resFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await reunionsApi.get(id, accessToken, controller.signal)
        if (active) {
          setReunion(data)
          setCompteRendu(data.compteRenduTexte ?? '')
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

  const pointsLabel = useMemo(() => {
    const map = new Map<string, string>()
    reunion?.pointsOrdreDuJour.forEach((p, i) => map.set(p.id, `${i + 1}. ${p.titre}`))
    return map
  }, [reunion])

  if (!peutVoirReunions(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const erreurMetier = (err: unknown, fallback: string) =>
    toast.error(fallback, err instanceof ApiError ? err.message : t('reunions.toast.reessayer'))

  const changerStatut = async (statut: StatutReunion) => {
    if (!accessToken || !reunion || statut === reunion.statut) return
    setStatutSaving(true)
    try {
      const maj = await reunionsApi.update(reunion.id, { statut }, accessToken)
      setReunion(maj)
      toast.success(t('reunions.toast.statutMaj'), t(`reunions.statuts.${statut}`))
    } catch (err) {
      erreurMetier(err, t('reunions.toast.statutImpossible'))
    } finally {
      setStatutSaving(false)
    }
  }

  const enregistrerCompteRendu = async () => {
    if (!accessToken || !reunion) return
    setCrSaving(true)
    try {
      const maj = await reunionsApi.update(
        reunion.id,
        { compteRenduTexte: compteRendu.trim() ? compteRendu : null },
        accessToken,
      )
      setReunion(maj)
      toast.success(t('reunions.toast.crEnregistre'))
    } catch (err) {
      erreurMetier(err, t('reunions.toast.crImpossible'))
    } finally {
      setCrSaving(false)
    }
  }

  const ajouterPoint = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !reunion) return
    if (nouveauPoint.trim().length === 0) {
      setErrPoint(t('reunions.ordreDuJour.intituleRequis'))
      requestAnimationFrame(() => focusPremierChampInvalide(pointFormRef.current))
      return
    }
    setAddingPoint(true)
    try {
      const point = await reunionsApi.addPoint(reunion.id, { titre: nouveauPoint.trim() }, accessToken)
      setReunion({ ...reunion, pointsOrdreDuJour: [...reunion.pointsOrdreDuJour, point] })
      setNouveauPoint('')
    } catch (err) {
      erreurMetier(err, t('reunions.toast.pointAjoutImpossible'))
    } finally {
      setAddingPoint(false)
    }
  }

  const supprimerPoint = async (pointId: string) => {
    if (!accessToken || !reunion) return
    setPointPending(pointId)
    try {
      await reunionsApi.removePoint(reunion.id, pointId, accessToken)
      setReunion({
        ...reunion,
        pointsOrdreDuJour: reunion.pointsOrdreDuJour.filter((p) => p.id !== pointId),
        // Une résolution liée à ce point voit son lien retiré côté back (SET NULL).
        resolutions: reunion.resolutions.map((r) =>
          r.pointOrdreDuJourId === pointId ? { ...r, pointOrdreDuJourId: null } : r,
        ),
      })
    } catch (err) {
      erreurMetier(err, t('reunions.toast.pointSuppressionImpossible'))
    } finally {
      setPointPending(null)
    }
  }

  const deplacerPoint = async (index: number, delta: -1 | 1) => {
    if (!accessToken || !reunion) return
    const cible = index + delta
    const pts = reunion.pointsOrdreDuJour
    if (cible < 0 || cible >= pts.length) return
    const ordreIds = pts.map((p) => p.id)
    ;[ordreIds[index], ordreIds[cible]] = [ordreIds[cible], ordreIds[index]]
    setReorderPending(true)
    try {
      const maj = await reunionsApi.reorderPoints(reunion.id, ordreIds, accessToken)
      setReunion(maj)
    } catch (err) {
      erreurMetier(err, t('reunions.toast.reordonnancementImpossible'))
    } finally {
      setReorderPending(false)
    }
  }

  const ajouterResolution = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !reunion) return
    if (resTexte.trim().length === 0) {
      setErrRes(t('resolutions.texteRequis'))
      requestAnimationFrame(() => focusPremierChampInvalide(resFormRef.current))
      return
    }
    setResSubmitting(true)
    try {
      const res = await resolutionsApi.create(
        reunion.id,
        {
          texte: resTexte.trim(),
          statut: resStatut,
          ...(resPointId ? { pointOrdreDuJourId: resPointId } : {}),
        },
        accessToken,
      )
      setReunion({ ...reunion, resolutions: [...reunion.resolutions, res] })
      setResTexte('')
      setResStatut('ADOPTEE')
      setResPointId('')
      toast.success(t('resolutions.toast.ajoutee'))
    } catch (err) {
      // Erreur métier possible : point d'ordre du jour d'une autre réunion (400).
      erreurMetier(err, t('resolutions.toast.ajoutImpossible'))
    } finally {
      setResSubmitting(false)
    }
  }

  const supprimerResolution = async (res: Resolution) => {
    if (!accessToken || !reunion) return
    setResPending(res.id)
    try {
      await resolutionsApi.remove(res.id, accessToken)
      setReunion({
        ...reunion,
        resolutions: reunion.resolutions.filter((r) => r.id !== res.id),
      })
    } catch (err) {
      erreurMetier(err, t('resolutions.toast.suppressionImpossible'))
    } finally {
      setResPending(null)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          overline={t('reunions.overline')}
          title={t('reunions.detail.titre')}
          back={{ to: '/reunions', label: t('reunions.detail.retour') }}
        />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !reunion) {
    return (
      <>
        <PageHeader
          overline={t('reunions.overline')}
          title={t('reunions.detail.titre')}
          back={{ to: '/reunions', label: t('reunions.detail.retour') }}
        />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? t('reunions.detail.introuvable')}
        </Card>
      </>
    )
  }

  const crReadOnly = !gestion

  return (
    <>
      <PageHeader
        overline={t('reunions.overline')}
        title={formatDateFR(reunion.date)}
        description={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
            {reunion.lieu}
          </span>
        }
        back={{ to: '/reunions', label: t('reunions.detail.retour') }}
        actions={
          <div className="flex items-center gap-2">
            <StatutReunionBadge statut={reunion.statut} />
            <TypeReunionBadge type={reunion.type} />
          </div>
        }
      />

      {/* Statut */}
      {gestion && (
        <Card className="nk-reveal nk-d2 mt-7 p-6">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('reunions.detail.statutSection')}</Overline>
          </div>
          <div className="mt-4 max-w-xs">
            <Field label={t('reunions.detail.statutLabel')}>
              <Select
                value={reunion.statut}
                disabled={statutSaving}
                onChange={(e) => changerStatut(e.target.value as StatutReunion)}
              >
                {STATUTS_REUNION.map((s) => (
                  <option key={s} value={s}>
                    {t(`reunions.statuts.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {/* Compte-rendu */}
      <Card className="nk-reveal nk-d2 mt-6 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('reunions.detail.compteRendu')}</Overline>
        </div>
        {crReadOnly ? (
          <p className="mt-4 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-muted-foreground">
            {reunion.compteRenduTexte?.trim()
              ? reunion.compteRenduTexte
              : t('reunions.detail.aucunCompteRendu')}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <Textarea
              value={compteRendu}
              onChange={(e) => setCompteRendu(e.target.value)}
              placeholder={t('reunions.detail.crPlaceholder')}
              rows={6}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                icon={FileText}
                loading={crSaving}
                disabled={compteRendu === (reunion.compteRenduTexte ?? '')}
                onClick={enregistrerCompteRendu}
              >
                {t('reunions.detail.crEnregistrer')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Ordre du jour */}
      <Card className="nk-reveal nk-d3 mt-6 p-6">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('reunions.ordreDuJour.titre')}</Overline>
        </div>

        {reunion.pointsOrdreDuJour.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('reunions.ordreDuJour.aucun')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {reunion.pointsOrdreDuJour.map((p, index) => (
              <li
                key={p.id}
                className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/40 p-3.5"
              >
                <span className="mt-0.5 w-6 shrink-0 text-center text-xs font-semibold text-brass">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{p.titre}</p>
                  {p.notes && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-pretty text-sm text-muted-foreground">
                      {p.notes}
                    </p>
                  )}
                </div>
                {gestion && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => deplacerPoint(index, -1)}
                      disabled={index === 0 || reorderPending}
                      aria-label={t('reunions.ordreDuJour.monter')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacerPoint(index, 1)}
                      disabled={index === reunion.pointsOrdreDuJour.length - 1 || reorderPending}
                      aria-label={t('reunions.ordreDuJour.descendre')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerPoint(p.id)}
                      disabled={pointPending === p.id}
                      aria-label={t('reunions.ordreDuJour.supprimer')}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:text-terra disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {gestion && (
          <form ref={pointFormRef} onSubmit={ajouterPoint} noValidate className="mt-4">
            <div className="flex gap-2">
              <Input
                value={nouveauPoint}
                onChange={(e) => {
                  setNouveauPoint(e.target.value)
                  setErrPoint(undefined)
                }}
                placeholder={t('reunions.ordreDuJour.ajouterPlaceholder')}
                aria-label={t('reunions.ordreDuJour.nouveauAria')}
                aria-invalid={errPoint ? true : undefined}
                aria-describedby={errPoint ? 'point-err' : undefined}
              />
              <Button type="submit" variant="ghost" icon={Plus} loading={addingPoint}>
                {t('reunions.ordreDuJour.ajouter')}
              </Button>
            </div>
            {errPoint && (
              <span id="point-err" role="alert" className="mt-1.5 block text-xs text-terra">
                {errPoint}
              </span>
            )}
          </form>
        )}
      </Card>

      {/* Résolutions */}
      <Card className="nk-reveal nk-d3 mt-6 p-6">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('resolutions.titre')}</Overline>
        </div>

        {reunion.resolutions.length === 0 ? (
          <EmptyState
            icon={Gavel}
            tone="jade"
            title={t('resolutions.vide.titre')}
            className="mt-4"
            description={
              gestion
                ? t('resolutions.vide.descriptionGestion')
                : t('resolutions.vide.description')
            }
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {reunion.resolutions.map((r) => (
              <li key={r.id} className="rounded-xl border border-hairline bg-surface-2/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <StatutResolutionBadge statut={r.statut} size="sm" />
                  {peutSupprimer && (
                    <button
                      type="button"
                      onClick={() => supprimerResolution(r)}
                      disabled={resPending === r.id}
                      aria-label={t('resolutions.supprimerAria')}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:text-terra disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-foreground">
                  {r.texte}
                </p>
                {r.pointOrdreDuJourId && pointsLabel.has(r.pointOrdreDuJourId) && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-faint">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                    {pointsLabel.get(r.pointOrdreDuJourId)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {gestion && (
          <form
            ref={resFormRef}
            onSubmit={ajouterResolution}
            noValidate
            className="mt-5 space-y-3 border-t border-hairline pt-5"
          >
            <Overline>{t('resolutions.form.titre')}</Overline>
            <Field label={t('resolutions.form.texteLabel')} required error={errRes}>
              <Textarea
                value={resTexte}
                onChange={(e) => {
                  setResTexte(e.target.value)
                  setErrRes(undefined)
                }}
                placeholder={t('resolutions.form.textePlaceholder')}
                rows={3}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('resolutions.form.statutLabel')}>
                <Select
                  value={resStatut}
                  onChange={(e) => setResStatut(e.target.value as StatutResolution)}
                >
                  {STATUTS_RESOLUTION.map((s) => (
                    <option key={s} value={s}>
                      {t(`resolutions.statuts.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('resolutions.form.pointLabel')} hint={t('resolutions.form.pointHint')}>
                <Select value={resPointId} onChange={(e) => setResPointId(e.target.value)}>
                  <option value="">{t('resolutions.form.pointAucun')}</option>
                  {reunion.pointsOrdreDuJour.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      {i + 1}. {p.titre}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" icon={Plus} loading={resSubmitting}>
                {t('resolutions.form.soumettre')}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Documents rattachés à la réunion */}
      <DocumentsSection
        entiteType="REUNION"
        entiteId={reunion.id}
        canManage={peutGererDocument(user?.role, 'REUNION')}
      />
    </>
  )
}

export default ReunionDetailPage
