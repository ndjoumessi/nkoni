import { useEffect, useRef, useState, type FormEvent } from 'react'
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
import {
  STATUT_COMMEMORATION_LABELS,
  TYPE_COMMEMORATION_LABELS,
} from '@/components/commemorations/CommemorationBadges'

const TYPES: TypeCommemoration[] = ['COMMEMORATION', 'CEREMONIE']
const STATUTS: StatutCommemoration[] = ['PLANIFIEE', 'TENUE', 'ANNULEE']

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Formulaire de commémoration/cérémonie (V2) — création ET édition. */
export function CommemorationFormPage() {
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
          if (active) toast.error('Chargement impossible', messageErreur(e))
        } finally {
          if (active) setLoading(false)
        }
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, autorise, editing, id, toast])

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
    const eTitre = titre.trim().length === 0 ? 'Le titre est requis.' : undefined
    const eDate = date ? undefined : 'La date est requise.'
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
        toast.success('Commémoration mise à jour')
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
        toast.success('Commémoration créée')
        navigate(`/commemorations/${cree.id}`)
      }
    } catch (err) {
      toast.error('Enregistrement impossible', err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setSubmitting(false)
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

  return (
    <>
      <PageHeader
        overline="Mémoire familiale"
        title={editing ? 'Modifier la commémoration' : 'Nouvelle commémoration'}
        back={{
          to: editing && id ? `/commemorations/${id}` : '/commemorations',
          label: 'Retour',
        }}
      />

      <form ref={formRef} onSubmit={soumettre} noValidate className="nk-reveal nk-d2 mt-7 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Événement</Overline>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Titre" required error={errTitre}>
              <Input
                autoFocus
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value)
                  setErrTitre(undefined)
                }}
                placeholder="Ex. Hommage aux fondateurs…"
                maxLength={300}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value as TypeCommemoration)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_COMMEMORATION_LABELS[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" required error={errDate}>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    setErrDate(undefined)
                  }}
                />
              </Field>
              <Field label="Statut">
                <Select value={statut} onChange={(e) => setStatut(e.target.value as StatutCommemoration)}>
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {STATUT_COMMEMORATION_LABELS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Lieu" hint="Optionnel.">
              <Input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Lieu de l’événement…" maxLength={300} />
            </Field>
            <Field label="Description" hint="Optionnel.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Déroulé, intentions, précisions…"
                rows={4}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Membres honorés / concernés</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">Optionnel — défunts commémorés ou membres concernés.</p>
          {membres.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucun membre disponible.</p>
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
              {membresConcernes.size} membre{membresConcernes.size > 1 ? 's' : ''} sélectionné
              {membresConcernes.size > 1 ? 's' : ''}
            </p>
          )}
        </Card>

        <Card className="p-6">
          <Overline>Notes</Overline>
          <p className="mt-2 text-sm text-faint">Optionnel — organisation, suivi…</p>
          <div className="mt-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes…" rows={3} />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(editing && id ? `/commemorations/${id}` : '/commemorations')}
          >
            Annuler
          </Button>
          <Button type="submit" icon={Flame} loading={submitting}>
            {editing ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </>
  )
}

export default CommemorationFormPage
