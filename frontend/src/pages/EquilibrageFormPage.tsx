import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Scale } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  contributionsApi,
  equilibragesApi,
  ApiError,
  type Contribution,
  type SimulationEquilibrage,
} from '@/lib/api'
import { peutEquilibrer } from '@/lib/roles'
import { formatFcfa } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Select, Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

/** Message métier clair à partir d'une erreur backend (§4.3), plutôt que le message brut. */
function messageEquilibrage(e: unknown, t: TFunction): string {
  if (e instanceof ApiError) {
    if (/aucune contribution pour l'année/i.test(e.message))
      return t('equilibrages.message.anneeSansCotisation')
    if (/somme des montants ajustés|total de la période/i.test(e.message))
      return t('equilibrages.message.sommeExacte')
    if (/plage d'années invalide/i.test(e.message))
      return t('equilibrages.message.plageInvalide')
    return e.message
  }
  return t('equilibrages.message.generique')
}

/**
 * Équilibrage entre années (§4.3) — réservé ADMIN + TRESORIERE.
 * Simulation (preview, aucune écriture) → ajustement avec contrainte bloquante
 * « somme === totalPeriode » → application réelle. Après succès, retour à la fiche.
 */
export function EquilibrageFormPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [membreNom, setMembreNom] = useState('')
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)

  const [anneeDebut, setAnneeDebut] = useState<number | null>(null)
  const [anneeFin, setAnneeFin] = useState<number | null>(null)

  const [simulation, setSimulation] = useState<SimulationEquilibrage | null>(null)
  const [montants, setMontants] = useState<string[]>([]) // aligné sur simulation.repartition
  const [simulating, setSimulating] = useState(false)
  const [applying, setApplying] = useState(false)

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
          contributionsApi.listByMembre(id, accessToken, signal),
        ])
        if (!active) return
        setMembreNom(`${membre.nom} ${membre.prenom}`)
        const tri = [...list].sort((a, b) => a.annee - b.annee)
        setContributions(tri)
        if (tri.length > 0) {
          setAnneeDebut(tri[0].annee)
          setAnneeFin(tri[tri.length - 1].annee)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) toast.error(t('equilibrages.toast.chargementImpossible'), e instanceof ApiError ? e.message : undefined)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, toast, t])

  const annees = useMemo(() => contributions.map((c) => c.annee), [contributions])
  const anneesSet = useMemo(() => new Set(annees), [annees])

  // Années de la plage sans contribution → l'équilibrage échouerait (couverture §4.3).
  const anneesManquantes = useMemo(() => {
    if (anneeDebut === null || anneeFin === null || anneeDebut > anneeFin) return []
    const manq: number[] = []
    for (let a = anneeDebut; a <= anneeFin; a++) if (!anneesSet.has(a)) manq.push(a)
    return manq
  }, [anneeDebut, anneeFin, anneesSet])

  const plageValide =
    anneeDebut !== null &&
    anneeFin !== null &&
    anneeDebut <= anneeFin &&
    anneesManquantes.length === 0

  // Toute modification de la plage invalide la simulation courante (re-simulation forcée).
  const changerPlage = (setter: (v: number) => void) => (v: number) => {
    setter(v)
    setSimulation(null)
    setMontants([])
  }

  const handleSimuler = async () => {
    if (!accessToken || !id || anneeDebut === null || anneeFin === null) return
    setSimulating(true)
    try {
      const res = await equilibragesApi.simuler(
        { membreId: id, anneeDebut, anneeFin },
        accessToken,
      )
      setSimulation(res)
      setMontants(res.repartition.map((l) => String(l.montantPropose)))
    } catch (e) {
      toast.error(t('equilibrages.toast.simulationImpossible'), messageEquilibrage(e, t))
    } finally {
      setSimulating(false)
    }
  }

  // Dérivés de l'ajustement manuel.
  const nums = montants.map((m) => {
    const n = Math.trunc(Number(m))
    return Number.isFinite(n) ? n : 0
  })
  const somme = nums.reduce((s, n) => s + n, 0)
  const totalPeriode = simulation?.totalPeriode ?? 0
  const ecart = somme - totalPeriode
  const tousPositifs = nums.every((n) => n >= 0)
  const exact = simulation !== null && ecart === 0 && tousPositifs

  const setMontant = (i: number, v: string) =>
    setMontants((prev) => prev.map((m, j) => (j === i ? v : m)))

  const reinitialiser = () => {
    if (simulation) setMontants(simulation.repartition.map((l) => String(l.montantPropose)))
  }

  const handleAppliquer = async () => {
    if (!accessToken || !id || anneeDebut === null || anneeFin === null || !exact) return
    setApplying(true)
    try {
      await equilibragesApi.appliquer(
        { membreId: id, anneeDebut, anneeFin, montantsAjustes: nums },
        accessToken,
      )
      toast.success(
        t('equilibrages.toast.applique'),
        t('equilibrages.toast.appliqueDetail', {
          debut: anneeDebut,
          fin: anneeFin,
          total: formatFcfa(totalPeriode),
        }),
      )
      navigate(`/membres/${id}`, { replace: true })
    } catch (e) {
      toast.error(t('equilibrages.toast.applicationImpossible'), messageEquilibrage(e, t))
    } finally {
      setApplying(false)
    }
  }

  if (!peutEquilibrer(user?.role)) {
    return <Navigate to={id ? `/membres/${id}` : '/membres'} replace />
  }

  const backTo = id ? `/membres/${id}` : '/membres'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        overline={t('equilibrages.header.overline')}
        title={t('equilibrages.header.titre')}
        description={membreNom || undefined}
        back={{ to: backTo, label: t('equilibrages.header.back') }}
      />

      {loading ? (
        <Card className="mt-7 space-y-4 p-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </Card>
      ) : annees.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            icon={Scale}
            title={t('equilibrages.empty.titre')}
            description={t('equilibrages.empty.description')}
          />
        </div>
      ) : (
        <>
          {/* Plage à équilibrer */}
          <Card className="nk-reveal nk-d2 mt-7 p-6">
            <Overline>{t('equilibrages.plage.titre')}</Overline>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t('equilibrages.plage.description')}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label={t('equilibrages.plage.anneeDebut')} required className="w-40">
                <Select
                  value={anneeDebut ?? ''}
                  onChange={(e) => changerPlage(setAnneeDebut)(Number(e.target.value))}
                >
                  {annees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('equilibrages.plage.anneeFin')} required className="w-40">
                <Select
                  value={anneeFin ?? ''}
                  onChange={(e) => changerPlage(setAnneeFin)(Number(e.target.value))}
                >
                  {annees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                icon={Scale}
                loading={simulating}
                disabled={!plageValide}
                onClick={handleSimuler}
                className="mb-[1px]"
              >
                {t('equilibrages.plage.simuler')}
              </Button>
            </div>

            {anneeDebut !== null && anneeFin !== null && anneeDebut > anneeFin && (
              <p className="mt-3 text-sm text-terra">
                {t('equilibrages.plage.debutApresFin')}
              </p>
            )}
            {anneesManquantes.length > 0 && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/[0.07] px-3.5 py-2.5 text-sm text-amber">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t('equilibrages.plage.manquantes', { annees: anneesManquantes.join(', ') })}
                </span>
              </div>
            )}
          </Card>

          {/* Répartition proposée + ajustement */}
          {simulation && (
            <Card className="nk-reveal mt-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <Overline>{t('equilibrages.repartition.titre')}</Overline>
                <span className="text-xs text-faint">
                  {t('equilibrages.repartition.simulationNote')}
                </span>
              </div>

              {/* En-tête de tableau */}
              <div className="mt-4 hidden grid-cols-[1fr_1.3fr_auto_1.3fr] items-center gap-3 px-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint sm:grid">
                <span>{t('equilibrages.repartition.colAnnee')}</span>
                <span>{t('equilibrages.repartition.colAvant')}</span>
                <span className="sr-only">→</span>
                <span>{t('equilibrages.repartition.colApres')}</span>
              </div>

              <ul className="mt-2 space-y-2">
                {simulation.repartition.map((l, i) => {
                  const delta = (nums[i] ?? 0) - l.montantAvant
                  return (
                    <li
                      key={l.annee}
                      className="grid grid-cols-2 items-center gap-3 rounded-xl border border-hairline bg-surface/50 px-4 py-3 sm:grid-cols-[1fr_1.3fr_auto_1.3fr]"
                    >
                      <span className="num font-medium text-foreground">{l.annee}</span>
                      <span className="num text-sm text-muted-foreground">
                        {formatFcfa(l.montantAvant)}
                      </span>
                      <ArrowRight
                        className="hidden h-4 w-4 text-faint sm:block"
                        aria-hidden="true"
                      />
                      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                        <Input
                          type="number"
                          min={0}
                          value={montants[i] ?? ''}
                          onChange={(e) => setMontant(i, e.target.value)}
                          className="num"
                          aria-label={t('equilibrages.repartition.montantAria', { annee: l.annee })}
                          aria-invalid={(nums[i] ?? 0) < 0 ? true : undefined}
                        />
                        {delta !== 0 && (
                          <Badge tone="info" size="sm">
                            {delta > 0 ? '+' : '−'}
                            {formatFcfa(Math.abs(delta))}
                          </Badge>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Récapitulatif somme vs total */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/50 px-4 py-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('equilibrages.recap.totalPeriode')}</span>
                  <span className="num font-semibold text-foreground">
                    {formatFcfa(totalPeriode)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {t('equilibrages.recap.sommeRepartie')}{' '}
                    <span className={`num font-semibold ${exact ? 'text-foreground' : 'text-terra'}`}>
                      {formatFcfa(somme)}
                    </span>
                  </span>
                  {exact ? (
                    <Badge tone="jade" size="sm" dot>
                      {t('equilibrages.recap.equilibre')}
                    </Badge>
                  ) : (
                    <Badge tone="terra" size="sm">
                      {t('equilibrages.recap.ecart')} {ecart > 0 ? '+' : '−'}
                      {formatFcfa(Math.abs(ecart))}
                    </Badge>
                  )}
                </div>
              </div>

              {!exact && (
                <p className="mt-2 text-xs text-faint">
                  {t('equilibrages.recap.ajusterHint')}
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={reinitialiser}>
                  {t('equilibrages.action.reinitialiser')}
                </Button>
                {/* Visible uniquement quand la somme est exacte (§4.3). */}
                {exact && (
                  <Button icon={Check} loading={applying} onClick={handleAppliquer}>
                    {t('equilibrages.action.appliquer')}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default EquilibrageFormPage
