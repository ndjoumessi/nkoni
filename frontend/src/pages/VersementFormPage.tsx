import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Check, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  contributionsApi,
  versementsApi,
  recusApi,
  ApiError,
  type Contribution,
  type ModeVersement,
  type Recu,
  type VersementCree,
} from '@/lib/api'
import { peutSaisirVersement, peutOuvrirAnnee } from '@/lib/roles'
import { formatFcfa } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'

const MODES: { value: ModeVersement; label: string }[] = [
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'TIERS', label: 'Tiers' },
  { value: 'AUTRE', label: 'Autre' },
]

const aujourdHui = (): string => new Date().toISOString().slice(0, 10)

/**
 * Saisie d'un versement pour une contribution (POST /versements). Réservé ADMIN + TRESORIERE.
 * Après succès : résumé des totaux réajustés + génération de reçu à la demande (§4.6).
 * « Ouvrir l'année » (POST /contributions/ouvrir-annee) débloque le cas « année absente ».
 */
export function VersementFormPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const presetContrib = searchParams.get('contributionId') ?? ''
  const [membreNom, setMembreNom] = useState('')
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [contribId, setContribId] = useState(presetContrib)
  const [montant, setMontant] = useState('')
  const [dateVersement, setDateVersement] = useState(aujourdHui())
  const [mode, setMode] = useState<ModeVersement>('ESPECES')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resultat, setResultat] = useState<VersementCree | null>(null)

  const [recu, setRecu] = useState<Recu | null>(null)
  const [generatingRecu, setGeneratingRecu] = useState(false)

  const [anneeAOuvrir, setAnneeAOuvrir] = useState(String(new Date().getFullYear()))
  const [ouvrant, setOuvrant] = useState(false)
  const [baremeManquant, setBaremeManquant] = useState(false)

  const chargerContributions = useCallback(
    async (signal?: AbortSignal): Promise<Contribution[]> => {
      if (!accessToken || !id) return []
      const list = await contributionsApi.listByMembre(id, accessToken, signal)
      list.sort((a, b) => b.annee - a.annee)
      setContributions(list)
      return list
    },
    [accessToken, id],
  )

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const [membre, list] = await Promise.all([
          membresApi.get(id, accessToken, signal),
          chargerContributions(signal),
        ])
        if (!active) return
        setMembreNom(`${membre.nom} ${membre.prenom}`)
        if (!presetContrib && list.length > 0) setContribId(list[0].id)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) toast.error('Chargement impossible', e instanceof ApiError ? e.message : undefined)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, chargerContributions, presetContrib, toast])

  if (!peutSaisirVersement(user?.role)) {
    return <Navigate to={id ? `/membres/${id}` : '/membres'} replace />
  }

  const handleOuvrirAnnee = async () => {
    if (!accessToken) return
    setBaremeManquant(false)
    setOuvrant(true)
    try {
      const res = await contributionsApi.ouvrirAnnee(Number(anneeAOuvrir), accessToken)
      const list = await chargerContributions()
      const nouvelle = list.find((c) => c.annee === res.annee)
      if (nouvelle) setContribId(nouvelle.id)
      toast.success(
        `Année ${res.annee} ouverte`,
        `${res.contributionsCreees} contribution(s) créée(s) sur ${res.membresEligibles} membre(s) éligible(s)` +
          (nouvelle ? '.' : ". Ce membre n'est pas éligible pour cette année."),
      )
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setBaremeManquant(true)
      toast.error(
        "Ouverture impossible",
        e instanceof ApiError ? e.message : "Échec de l'ouverture de l'année.",
      )
    } finally {
      setOuvrant(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !contribId) return
    setSaving(true)
    try {
      const res = await versementsApi.create(
        {
          contributionId: contribId,
          montant: Number(montant),
          dateVersement,
          mode,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        accessToken,
      )
      setResultat(res)
      toast.success('Versement enregistré', `${formatFcfa(res.versement.montant)} · année ${res.contribution.annee}`)
    } catch (e) {
      toast.error(
        'Enregistrement impossible',
        e instanceof ApiError ? e.message : 'Échec de l’enregistrement du versement.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleGenererRecu = async () => {
    if (!accessToken || !resultat) return
    setGeneratingRecu(true)
    try {
      const r = await recusApi.generer(resultat.versement.id, accessToken)
      setRecu(r)
      toast.success('Reçu généré', `N° ${r.numero}`)
    } catch (e) {
      toast.error(
        'Génération impossible',
        e instanceof ApiError ? e.message : 'Échec de la génération du reçu.',
      )
    } finally {
      setGeneratingRecu(false)
    }
  }

  const nouveauVersement = () => {
    setResultat(null)
    setRecu(null)
    setMontant('')
    setNote('')
    setDateVersement(aujourdHui())
  }

  const backTo = id ? `/membres/${id}` : '/membres'

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        overline="Trésorerie"
        title="Nouveau versement"
        description={membreNom || undefined}
        back={{ to: backTo, label: 'Fiche du membre' }}
      />

      {loading ? (
        <Card className="mt-7 space-y-4 p-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </Card>
      ) : resultat ? (
        /* --- Résumé après succès --- */
        <div className="nk-reveal nk-d2 mt-7 space-y-4">
          <Card className="border-jade/30 bg-jade/[0.07] p-6">
            <div className="flex items-center gap-2 text-jade">
              <Check className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-semibold">Versement enregistré</h2>
            </div>
            <p className="num mt-3 text-sm text-foreground/85">
              {formatFcfa(resultat.versement.montant)} · année {resultat.contribution.annee}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">
                  Total versé
                </dt>
                <dd className="num mt-1 font-semibold text-foreground">
                  {formatFcfa(resultat.contribution.montantVerse)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">
                  Total valorisé
                </dt>
                <dd className="num mt-1 font-semibold text-foreground">
                  {formatFcfa(resultat.contribution.montantValorise)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            {recu ? (
              <Badge tone="jade" size="lg">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Reçu généré : {recu.numero}
              </Badge>
            ) : (
              <Button icon={FileText} loading={generatingRecu} onClick={handleGenererRecu}>
                Générer le reçu
              </Button>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={nouveauVersement}>
              Nouveau versement
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/membres/${id}`)}>
              Retour à la fiche
            </Button>
          </div>
        </div>
      ) : (
        /* --- Formulaire --- */
        <Card className="nk-reveal nk-d2 mt-7 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {contributions.length === 0 ? (
              <p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
                Aucune contribution n'existe pour ce membre. Ouvrez d'abord une année ci-dessous
                pour pouvoir enregistrer un versement.
              </p>
            ) : (
              <Field label="Année (contribution)" required>
                <Select required value={contribId} onChange={(e) => setContribId(e.target.value)}>
                  {contributions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.annee} — versé {formatFcfa(c.montantVerse)} / attendu{' '}
                      {formatFcfa(c.montantAttendu)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {contributions.length > 0 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Montant (FCFA)" required>
                    <Input
                      required
                      type="number"
                      min={1}
                      value={montant}
                      onChange={(e) => setMontant(e.target.value)}
                    />
                  </Field>
                  <Field label="Date" required>
                    <Input
                      required
                      type="date"
                      value={dateVersement}
                      onChange={(e) => setDateVersement(e.target.value)}
                    />
                  </Field>
                  <Field label="Mode" required>
                    <Select value={mode} onChange={(e) => setMode(e.target.value as ModeVersement)}>
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Note (optionnelle)">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>

                <div className="flex justify-end">
                  <Button type="submit" loading={saving} disabled={!contribId}>
                    Enregistrer le versement
                  </Button>
                </div>
              </>
            )}

            {/* Ouvrir une année (ADMIN + TRESORIERE) */}
            {peutOuvrirAnnee(user?.role) && (
              <div className="border-t border-hairline pt-5">
                <Overline>Ouvrir une année</Overline>
                <p className="mt-1.5 text-xs text-faint">
                  Crée les contributions de tous les membres éligibles pour l'année (nécessite un
                  barème configuré pour cette année).
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    min={1900}
                    max={2200}
                    value={anneeAOuvrir}
                    onChange={(e) => setAnneeAOuvrir(e.target.value)}
                    className="w-32"
                    aria-label="Année à ouvrir"
                  />
                  <Button
                    variant="outline"
                    icon={CalendarPlus}
                    loading={ouvrant}
                    onClick={handleOuvrirAnnee}
                  >
                    Ouvrir l'année
                  </Button>
                </div>
                {baremeManquant && (
                  <p className="mt-3 text-sm text-terra">
                    Aucun barème configuré pour cette année.{' '}
                    <Link to="/bareme" className="font-semibold text-brass underline">
                      Configurer le barème →
                    </Link>
                  </p>
                )}
              </div>
            )}
          </form>
        </Card>
      )}
    </div>
  )
}

export default VersementFormPage
