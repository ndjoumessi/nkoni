import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CalendarRange, Flame, MapPin, Pencil, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  commemorationsApi,
  ApiError,
  messageErreur,
  type Commemoration,
  type StatutCommemoration,
} from '@/lib/api'
import {
  peutVoirCommemorations,
  peutGererCommemorations,
  peutSupprimerCommemoration,
  peutGererDocument,
} from '@/lib/roles'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { formatDateFR } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import {
  StatutCommemorationBadge,
  TypeCommemorationBadge,
  STATUT_COMMEMORATION_LABELS,
} from '@/components/commemorations/CommemorationBadges'

const STATUTS: StatutCommemoration[] = ['PLANIFIEE', 'TENUE', 'ANNULEE']

/** Détail d'une commémoration / cérémonie (V2). */
export function CommemorationDetailPage() {
  const { id = '' } = useParams()
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const gestion = peutGererCommemorations(user?.role)
  const peutSupprimer = peutSupprimerCommemoration(user?.role)

  const [item, setItem] = useState<Commemoration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statutSaving, setStatutSaving] = useState(false)
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
        const data = await commemorationsApi.get(id, accessToken, controller.signal)
        if (active) setItem(data)
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

  if (!peutVoirCommemorations(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const erreurMetier = (err: unknown, fallback: string) =>
    toast.error(fallback, err instanceof ApiError ? err.message : 'Réessayez plus tard.')

  const changerStatut = async (statut: StatutCommemoration) => {
    if (!accessToken || !item || statut === item.statut) return
    setStatutSaving(true)
    try {
      const maj = await commemorationsApi.update(item.id, { statut }, accessToken)
      setItem(maj)
      toast.success('Statut mis à jour', STATUT_COMMEMORATION_LABELS[statut].label)
    } catch (err) {
      erreurMetier(err, 'Changement de statut impossible')
    } finally {
      setStatutSaving(false)
    }
  }

  const supprimer = async () => {
    if (!accessToken || !item) return
    setDeleting(true)
    try {
      await commemorationsApi.remove(item.id, accessToken)
      toast.success('Commémoration supprimée', item.titre)
      navigate('/commemorations')
    } catch (err) {
      erreurMetier(err, 'Suppression impossible')
      setDeleting(false)
      setDeleteOuvert(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader overline="Mémoire familiale" title="Commémoration" back={{ to: '/commemorations', label: 'Retour' }} />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !item) {
    return (
      <>
        <PageHeader overline="Mémoire familiale" title="Commémoration" back={{ to: '/commemorations', label: 'Retour' }} />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? 'Commémoration introuvable.'}
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline="Mémoire familiale"
        title={item.titre}
        back={{ to: '/commemorations', label: 'Retour aux commémorations' }}
        actions={
          <div className="flex items-center gap-2">
            {gestion && (
              <ButtonLink to={`/commemorations/${item.id}/editer`} variant="ghost" icon={Pencil}>
                Modifier
              </ButtonLink>
            )}
            {peutSupprimer && (
              <Button type="button" variant="danger" icon={Trash2} onClick={() => setDeleteOuvert(true)}>
                Supprimer
              </Button>
            )}
          </div>
        }
      />

      {/* Détails */}
      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <TypeCommemorationBadge type={item.type} />
          <StatutCommemorationBadge statut={item.statut} />
        </div>

        {item.description && (
          <p className="mt-4 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-foreground">
            {item.description}
          </p>
        )}

        <dl className="mt-5 grid gap-4 border-t border-hairline pt-5 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-faint" aria-hidden="true" />
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-foreground">{formatDateFR(item.date)}</dd>
          </div>
          {item.lieu && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-faint" aria-hidden="true" />
              <dt className="text-muted-foreground">Lieu</dt>
              <dd className="text-foreground">{item.lieu}</dd>
            </div>
          )}
        </dl>

        {item.membresConcernes.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Membres honorés / concernés</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.membresConcernes.map((m) => (
                <Badge key={m.id} tone="neutral" size="sm">
                  {m.prenom} {m.nom}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Statut (changement rapide) */}
      {gestion && (
        <Card className="nk-reveal nk-d3 mt-6 p-6">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Statut</Overline>
          </div>
          <div className="mt-4 max-w-xs">
            <Field label="Statut de l’événement">
              <Select
                value={item.statut}
                disabled={statutSaving}
                onChange={(e) => changerStatut(e.target.value as StatutCommemoration)}
              >
                {STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {STATUT_COMMEMORATION_LABELS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {/* Notes */}
      {item.notes?.trim() && (
        <Card className="nk-reveal nk-d3 mt-6 p-6">
          <Overline>Notes</Overline>
          <p className="mt-3 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-muted-foreground">
            {item.notes}
          </p>
        </Card>
      )}

      {/* Documents rattachés */}
      <DocumentsSection
        entiteType="COMMEMORATION"
        entiteId={item.id}
        canManage={peutGererDocument(user?.role, 'COMMEMORATION')}
      />

      {deleteOuvert && (
        <Modal open onClose={() => setDeleteOuvert(false)} title="Supprimer la commémoration ?">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{item.titre}</span> sera définitivement
            supprimée. Cette action est irréversible.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteOuvert(false)}>
              Annuler
            </Button>
            <Button type="button" variant="danger" icon={Trash2} loading={deleting} onClick={supprimer}>
              Supprimer définitivement
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default CommemorationDetailPage
