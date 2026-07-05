import { useEffect, useState, type FormEvent } from 'react'
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
import { formatDateFR } from '@/lib/utils'
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

  // Formulaire de nomination.
  const [membreId, setMembreId] = useState('')
  const [dateDebut, setDateDebut] = useState(aujourdHui())
  const [notes, setNotes] = useState('')
  const [nominating, setNominating] = useState(false)

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
    toast.error(fallback, err instanceof ApiError ? err.message : 'Réessayez plus tard.')

  const recharger = async () => {
    if (!accessToken || !id) return
    const data = await fonctionsApi.get(id, accessToken)
    setFonction(data)
  }

  const enregistrerFonction = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !fonction || nom.trim().length === 0) return
    setSavingFonction(true)
    try {
      const maj = await fonctionsApi.update(
        fonction.id,
        { nom: nom.trim(), description: description.trim() ? description.trim() : null },
        accessToken,
      )
      setFonction({ ...fonction, nom: maj.nom, description: maj.description })
      toast.success('Fonction mise à jour')
    } catch (err) {
      erreurMetier(err, 'Mise à jour impossible') // 409 possible (nom déjà utilisé)
    } finally {
      setSavingFonction(false)
    }
  }

  const nommer = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !fonction || !membreId || !dateDebut) return
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
      toast.success('Titulaire nommé', 'L’affectation précédente a été clôturée.')
    } catch (err) {
      // Erreurs métier possibles : 400 (date incohérente), 404 (membre/fonction introuvable).
      erreurMetier(err, 'Nomination impossible')
    } finally {
      setNominating(false)
    }
  }

  const supprimer = async () => {
    if (!accessToken || !fonction) return
    setDeleting(true)
    try {
      await fonctionsApi.remove(fonction.id, accessToken)
      toast.success('Fonction supprimée', fonction.nom)
      navigate('/fonctions')
    } catch (err) {
      erreurMetier(err, 'Suppression impossible')
      setDeleting(false)
      setDeleteOuvert(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          overline="Organisation"
          title="Fonction"
          back={{ to: '/fonctions', label: 'Retour aux fonctions' }}
        />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }

  if (error || !fonction) {
    return (
      <>
        <PageHeader
          overline="Organisation"
          title="Fonction"
          back={{ to: '/fonctions', label: 'Retour aux fonctions' }}
        />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? 'Fonction introuvable.'}
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
        overline="Organisation"
        title={fonction.nom}
        description={fonction.description ?? undefined}
        back={{ to: '/fonctions', label: 'Retour aux fonctions' }}
        actions={
          peutSupprimer && (
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={() => setDeleteOuvert(true)}
            >
              Supprimer
            </Button>
          )
        }
      />

      {/* Titulaire actuel */}
      <Card className="nk-reveal nk-d2 mt-7 p-6">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Titulaire actuel</Overline>
        </div>
        {active ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="jade" size="lg" dot>
              {nomMembre(active.membre)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              en fonction depuis le {formatDateFR(active.dateDebut)}
            </span>
          </div>
        ) : (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserX className="h-4 w-4 text-faint" aria-hidden="true" />
            Fonction vacante — aucun titulaire en cours.
          </p>
        )}
      </Card>

      {/* Nommer un titulaire */}
      {gestion && (
        <Card className="nk-reveal nk-d2 mt-6 p-6">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Nommer un titulaire</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">
            {active
              ? 'Nommer un nouveau titulaire clôture automatiquement l’affectation en cours (à la date de début choisie).'
              : 'Désignez le premier titulaire de cette fonction.'}
          </p>
          <form onSubmit={nommer} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Membre" required>
                <Select value={membreId} onChange={(e) => setMembreId(e.target.value)}>
                  <option value="">— Choisir un membre —</option>
                  {membres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date de début" required>
                <Input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes" hint="Optionnel.">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Circonstances de la nomination…"
                rows={2}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                icon={UserPlus}
                loading={nominating}
                disabled={!membreId || !dateDebut}
              >
                Nommer
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Historique des nominations */}
      <Card className="nk-reveal nk-d3 mt-6 p-6">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Historique des nominations</Overline>
        </div>

        {fonction.affectations.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Aucune nomination"
            className="mt-4"
            description={
              gestion
                ? 'Nommez un titulaire ci-dessus pour démarrer l’historique.'
                : 'Les nominations apparaîtront ici.'
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
                          En cours
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          Clôturée
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateFR(a.dateDebut)} → {a.dateFin ? formatDateFR(a.dateFin) : 'en cours'}
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
            <Overline>Modifier la fonction</Overline>
          </div>
          <form onSubmit={enregistrerFonction} className="mt-4 space-y-3">
            <Field label="Nom" required>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Description" hint="Optionnel.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                icon={Pencil}
                loading={savingFonction}
                disabled={nom.trim().length === 0 || fonctionInchangee}
              >
                Enregistrer
              </Button>
            </div>
          </form>
        </Card>
      )}

      {deleteOuvert && (
        <Modal open onClose={() => setDeleteOuvert(false)} title="Supprimer la fonction ?">
          <p className="text-sm leading-relaxed text-muted-foreground">
            La fonction <span className="font-medium text-foreground">{fonction.nom}</span> et{' '}
            <span className="font-medium text-foreground">
              tout son historique de nominations
            </span>{' '}
            seront définitivement supprimés. Cette action est irréversible.
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

export default FonctionDetailPage
