import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CalendarRange, Check, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { baremeApi, ApiError, messageErreur, type Bareme } from '@/lib/api'
import { peutVoirBareme, peutGererBareme } from '@/lib/roles'
import { focusPremierChampInvalide } from '@/lib/utils'
import { formatFcfa } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/**
 * Barème annuel (§4.2 / §5.3). Lecture : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE.
 * Écriture : ADMIN uniquement. Dernier maillon barème → ouverture d'année → versement.
 */
export function BaremePage() {
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const gestion = peutGererBareme(user?.role)

  const [baremes, setBaremes] = useState<Bareme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [annee, setAnnee] = useState(String(new Date().getFullYear()))
  const [montant, setMontant] = useState('')
  const [adding, setAdding] = useState(false)
  const [errAnnee, setErrAnnee] = useState<string | undefined>(undefined)
  const [errMontant, setErrMontant] = useState<string | undefined>(undefined)
  const ajoutRef = useRef<HTMLFormElement>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editMontant, setEditMontant] = useState('')
  const [errEdit, setErrEdit] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)

  /** Contrôle d'un montant attendu (≥ 0, requis). */
  const validerMontant = (v: string): string | undefined => {
    if (v.trim().length === 0) return 'Le montant est requis.'
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 'Montant invalide (≥ 0).'
    return undefined
  }

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const list = await baremeApi.list(accessToken, controller.signal)
        if (active) setBaremes(list)
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
  }, [accessToken])

  if (!peutVoirBareme(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const anneeNum = Number(annee)
    const eAnnee =
      annee.trim().length === 0
        ? "L'année est requise."
        : !Number.isInteger(anneeNum) || anneeNum < 1900 || anneeNum > 2200
          ? 'Année invalide (entre 1900 et 2200).'
          : undefined
    const eMontant = validerMontant(montant)
    setErrAnnee(eAnnee)
    setErrMontant(eMontant)
    if (eAnnee || eMontant) {
      requestAnimationFrame(() => focusPremierChampInvalide(ajoutRef.current))
      return
    }
    setAdding(true)
    try {
      const cree = await baremeApi.create(Number(annee), Number(montant), accessToken)
      setBaremes((prev) => [cree, ...prev].sort((a, b) => b.annee - a.annee))
      setMontant('')
      toast.success('Barème ajouté', `Année ${cree.annee} · ${formatFcfa(cree.montantAttendu)}.`)
    } catch (e) {
      toast.error(
        'Ajout impossible',
        e instanceof ApiError ? e.message : 'Échec de l’ajout du barème.',
      )
    } finally {
      setAdding(false)
    }
  }

  const demarrerEdition = (b: Bareme) => {
    setEditId(b.id)
    setEditMontant(String(b.montantAttendu))
    setErrEdit(undefined)
  }

  const enregistrerEdition = async (id: string) => {
    if (!accessToken) return
    const eEdit = validerMontant(editMontant)
    setErrEdit(eEdit)
    if (eEdit) {
      requestAnimationFrame(() => editRef.current?.focus())
      return
    }
    setSaving(true)
    try {
      const maj = await baremeApi.update(id, Number(editMontant), accessToken)
      setBaremes((prev) => prev.map((b) => (b.id === id ? maj : b)))
      setEditId(null)
      toast.success('Barème mis à jour', `Année ${maj.annee} · ${formatFcfa(maj.montantAttendu)}.`)
    } catch (e) {
      toast.error(
        'Mise à jour impossible',
        e instanceof ApiError ? e.message : 'Échec de la mise à jour.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        overline="Configuration"
        title="Barème annuel"
        description={
          <>Montant attendu par membre pour chaque année{!gestion && ' (lecture seule)'}.</>
        }
      />

      {gestion && (
        <Card className="nk-reveal nk-d2 mt-7 p-5">
          <form ref={ajoutRef} onSubmit={handleAdd} noValidate>
            <Overline>Ajouter une année</Overline>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <Field label="Année" required className="w-32" error={errAnnee}>
                <Input
                  type="number"
                  min={1900}
                  max={2200}
                  value={annee}
                  onChange={(e) => {
                    setAnnee(e.target.value)
                    setErrAnnee(undefined)
                  }}
                />
              </Field>
              <Field label="Montant attendu (FCFA)" required className="flex-1" error={errMontant}>
                <Input
                  type="number"
                  min={0}
                  value={montant}
                  onChange={(e) => {
                    setMontant(e.target.value)
                    setErrMontant(undefined)
                  }}
                />
              </Field>
              {/* Label fantôme : cale le bouton exactement au niveau des champs (§8),
                  indépendamment des messages d'erreur qui poussent la hauteur en dessous. */}
              <div className="flex flex-col">
                <span
                  className="mb-1.5 text-[0.72rem] uppercase tracking-[0.1em]"
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
                <Button type="submit" icon={Plus} loading={adding}>
                  Ajouter
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <div className="nk-reveal nk-d3 mt-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && baremes.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title="Aucun barème configuré"
            description={
              gestion
                ? 'Ajoutez une première année ci-dessus pour fixer le montant attendu par membre.'
                : 'Aucune année n’a encore été configurée par un administrateur.'
            }
          />
        )}

        {!loading && !error && baremes.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-hairline px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">
              <span>Année</span>
              <span>Montant attendu</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-hairline">
              {baremes.map((b) => (
                <li
                  key={b.id}
                  className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 px-5 py-3.5"
                >
                  <span className="num font-medium text-foreground">{b.annee}</span>
                  {editId === b.id ? (
                    <div>
                      <Input
                        ref={editRef}
                        type="number"
                        min={0}
                        value={editMontant}
                        onChange={(e) => {
                          setEditMontant(e.target.value)
                          setErrEdit(undefined)
                        }}
                        aria-label={`Montant ${b.annee}`}
                        aria-invalid={errEdit ? true : undefined}
                        aria-describedby={errEdit ? `edit-err-${b.id}` : undefined}
                      />
                      {errEdit && (
                        <span
                          id={`edit-err-${b.id}`}
                          role="alert"
                          className="mt-1 block text-xs text-terra"
                        >
                          {errEdit}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="num text-sm text-foreground/85">
                      {formatFcfa(b.montantAttendu)}
                    </span>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    {gestion && editId === b.id ? (
                      <>
                        <Button
                          variant="jade"
                          size="sm"
                          onClick={() => enregistrerEdition(b.id)}
                          loading={saving}
                          icon={saving ? undefined : Check}
                        >
                          Enregistrer
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(null)
                            setErrEdit(undefined)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Annuler"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : gestion ? (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Pencil}
                        onClick={() => demarrerEdition(b)}
                      >
                        Modifier
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}

export default BaremePage
