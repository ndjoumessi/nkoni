import { useEffect, useState } from 'react'
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
import {
  NiveauBadge,
  StatutConflitBadge,
  STATUT_CONFLIT_LABELS,
} from '@/components/conflits/ConflitBadges'

const STATUTS: StatutConflit[] = ['OUVERT', 'EN_COURS', 'RESOLU', 'CLOS']

/** Détail d'un conflit (§4.4). L'API ne renvoie que les conflits autorisés (404 sinon). */
export function ConflitDetailPage() {
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
    toast.error(fallback, err instanceof ApiError ? err.message : 'Réessayez plus tard.')

  const changerStatut = async (statut: StatutConflit) => {
    if (!accessToken || !conflit || statut === conflit.statut) return
    setStatutSaving(true)
    try {
      const maj = await conflitsApi.update(conflit.id, { statut }, accessToken)
      setConflit(maj)
      toast.success('Statut mis à jour', STATUT_CONFLIT_LABELS[statut].label)
    } catch (err) {
      erreurMetier(err, 'Changement de statut impossible')
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
      toast.success('Notes enregistrées')
    } catch (err) {
      erreurMetier(err, 'Enregistrement impossible')
    } finally {
      setNotesSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader overline="Suivi familial" title="Conflit" back={{ to: '/conflits', label: 'Retour aux conflits' }} />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !conflit) {
    return (
      <>
        <PageHeader overline="Suivi familial" title="Conflit" back={{ to: '/conflits', label: 'Retour aux conflits' }} />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? 'Conflit introuvable ou hors de votre périmètre.'}
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline="Suivi familial"
        title={conflit.titre}
        back={{ to: '/conflits', label: 'Retour aux conflits' }}
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
          <Overline>Détails</Overline>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {conflit.description}
        </p>

        <dl className="mt-5 grid gap-4 border-t border-hairline pt-5 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-faint" aria-hidden="true" />
            <dt className="text-muted-foreground">Ouvert le</dt>
            <dd className="text-foreground">{formatDateFR(conflit.dateOuverture)}</dd>
          </div>
          {conflit.dateResolution && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-jade" aria-hidden="true" />
              <dt className="text-muted-foreground">Résolu le</dt>
              <dd className="text-foreground">{formatDateFR(conflit.dateResolution)}</dd>
            </div>
          )}
          {conflit.auteur && (
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-faint" aria-hidden="true" />
              <dt className="text-muted-foreground">Déclaré par</dt>
              <dd className="truncate text-foreground">{conflit.auteur.email}</dd>
            </div>
          )}
          {conflit.responsableSuivi && (
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-faint" aria-hidden="true" />
              <dt className="text-muted-foreground">Responsable de suivi</dt>
              <dd className="truncate text-foreground">{conflit.responsableSuivi.email}</dd>
            </div>
          )}
        </dl>

        {conflit.membresConcernes.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Membres concernés</span>
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
          <Overline>Suivi &amp; résolution</Overline>
        </div>

        {peutModifier ? (
          <div className="mt-4 space-y-4">
            <div className="max-w-xs">
              <Field label="Statut">
                <Select
                  value={conflit.statut}
                  disabled={statutSaving}
                  onChange={(e) => changerStatut(e.target.value as StatutConflit)}
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {STATUT_CONFLIT_LABELS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes de suivi">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Éléments de suivi, médiation, résolution…"
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
                Enregistrer les notes
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {conflit.notes?.trim() ? conflit.notes : 'Aucune note de suivi.'}
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
