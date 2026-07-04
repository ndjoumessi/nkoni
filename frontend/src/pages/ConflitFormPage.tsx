import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
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
import { NIVEAU_LABELS } from '@/components/conflits/ConflitBadges'

const NIVEAUX: { value: NiveauConfidentialite; label: string; aide: string }[] = [
  { value: 'PUBLIC', label: 'Public', aide: 'Visible par tous les membres connectés.' },
  { value: 'BUREAU', label: 'Bureau', aide: 'Visible par le bureau exécutif (ADMIN, Président, Secrétaire).' },
  {
    value: 'CONFIDENTIEL',
    label: 'Confidentiel',
    aide: 'Visible uniquement par vous, le responsable de suivi désigné, et l’administrateur.',
  },
]

/** Déclaration d'un conflit (§4.4) — réservée ADMIN/PRESIDENT/SECRETAIRE. */
export function ConflitFormPage() {
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

  const aideNiveau = useMemo(() => NIVEAUX.find((n) => n.value === niveau)?.aide, [niveau])

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
    if (!accessToken || titre.trim().length === 0 || description.trim().length === 0) return
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
      toast.success('Conflit déclaré')
      navigate(`/conflits/${cree.id}`)
    } catch (err) {
      toast.error('Déclaration impossible', err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setSubmitting(false)
    }
  }

  const invalide = titre.trim().length === 0 || description.trim().length === 0

  return (
    <>
      <PageHeader
        overline="Suivi familial"
        title="Déclarer un conflit"
        back={{ to: '/conflits', label: 'Retour aux conflits' }}
      />

      <form onSubmit={soumettre} className="nk-reveal nk-d2 mt-7 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Objet du conflit</Overline>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Titre" required>
              <Input
                autoFocus
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Objet du litige…"
                maxLength={300}
              />
            </Field>
            <Field label="Description" required>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Circonstances, parties, contexte…"
                rows={5}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>Confidentialité</Overline>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Niveau de confidentialité" required hint={aideNiveau}>
              <Select value={niveau} onChange={(e) => changerNiveau(e.target.value as NiveauConfidentialite)}>
                {NIVEAUX.map((n) => (
                  <option key={n.value} value={n.value}>
                    {NIVEAU_LABELS[n.value].label}
                  </option>
                ))}
              </Select>
            </Field>
            {niveau === 'CONFIDENTIEL' && (
              <Field
                label="Responsable de suivi"
                hint="Pourra consulter ce conflit confidentiel (en plus de vous et de l’admin)."
              >
                <Select
                  value={responsableSuiviId}
                  onChange={(e) => setResponsableSuiviId(e.target.value)}
                >
                  <option value="">— Aucun —</option>
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
            <Overline>Membres concernés</Overline>
          </div>
          <p className="mt-2 text-sm text-faint">Parties prenantes du litige (optionnel).</p>
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
          <Overline>Notes de suivi</Overline>
          <p className="mt-2 text-sm text-faint">Optionnel — éléments de suivi / résolution.</p>
          <div className="mt-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes internes…"
              rows={3}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/conflits')}>
            Annuler
          </Button>
          <Button type="submit" icon={ShieldAlert} loading={submitting} disabled={invalide}>
            Déclarer le conflit
          </Button>
        </div>
      </form>
    </>
  )
}

export default ConflitFormPage
