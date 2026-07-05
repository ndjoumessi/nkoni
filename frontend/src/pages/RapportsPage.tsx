import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  Coins,
  Minus,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  baremeApi,
  rapportsApi,
  messageErreur,
  type ComparaisonPeriodes,
  type RapportAnnee,
  type RapportFinancier,
} from '@/lib/api'
import { peutVoirRapports } from '@/lib/roles'
import { formatFcfa, formatNombre, formatPourcent } from '@/lib/format'
import { cn, prefersReducedMotion } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Field, Select } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

type Mode = 'evolution' | 'comparaison'

/** Est-ce une annulation de requête (à ignorer) ? */
function estAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/* -------------------------------------------------------------------------- */
/* Variation                                                                  */
/* -------------------------------------------------------------------------- */

/** Badge de variation en % : jade si progression, terracotta si régression, neutre sinon. */
function VariationBadge({ valeur }: { valeur: number | null }) {
  if (valeur === null) {
    return <span className="text-xs text-faint">n/a</span>
  }
  if (valeur === 0) {
    return (
      <Badge tone="neutral" size="sm">
        <Minus className="h-3 w-3" aria-hidden="true" />
        0 %
      </Badge>
    )
  }
  const positif = valeur > 0
  return (
    <Badge tone={positif ? 'jade' : 'terra'} size="sm">
      {positif ? (
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
      ) : (
        <TrendingDown className="h-3 w-3" aria-hidden="true" />
      )}
      {positif ? '+' : ''}
      {formatPourcent(valeur)}
    </Badge>
  )
}

/* -------------------------------------------------------------------------- */
/* Graphe d'évolution (barres attendu vs collecté, §10)                       */
/* -------------------------------------------------------------------------- */

function GrapheEvolution({ annees }: { annees: RapportAnnee[] }) {
  const maxAttendu = useMemo(
    () => Math.max(1, ...annees.map((a) => a.totalAttendu)),
    [annees],
  )

  // Animation d'entrée : les barres grandissent de 0 (gated reduced-motion, §7/§10).
  const [monte, setMonte] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (monte) return
    const id = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(id)
  }, [monte])

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>Attendu vs collecté par année</Overline>
        </div>
        <div className="flex items-center gap-4 text-xs text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" aria-hidden="true" />
            Attendu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-jade to-brass"
              aria-hidden="true"
            />
            Collecté
          </span>
        </div>
      </div>

      <div
        className="mt-6 flex items-end justify-around gap-3 sm:gap-5"
        style={{ height: '13rem' }}
        aria-hidden="true"
      >
        {annees.map((a) => {
          const hAttendu = (a.totalAttendu / maxAttendu) * 100
          const hCollecte = (a.totalCollecte / maxAttendu) * 100
          return (
            <div key={a.annee} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="num text-xs font-semibold text-jade">
                {formatPourcent(a.tauxRecouvrement)}
              </span>
              <div className="relative flex h-full w-full max-w-[3.5rem] items-end justify-center">
                {/* Piste « attendu » */}
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-surface-3 transition-[height] duration-700 ease-out"
                  style={{ height: `${monte ? hAttendu : 0}%` }}
                />
                {/* Remplissage « collecté » */}
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-gradient-to-b from-jade to-brass transition-[height] duration-700 ease-out"
                  style={{ height: `${monte ? hCollecte : 0}%` }}
                />
              </div>
              <span className="num text-sm font-medium text-foreground">{a.annee}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Table dense multi-années (§10)                                             */
/* -------------------------------------------------------------------------- */

function TableEvolution({ annees }: { annees: RapportAnnee[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-[0.7rem] uppercase tracking-[0.1em] text-faint">
              <th className="px-4 py-3 text-left font-medium">Année</th>
              <th className="px-4 py-3 text-right font-medium">Attendu</th>
              <th className="px-4 py-3 text-right font-medium">Collecté</th>
              <th className="px-4 py-3 text-right font-medium">Taux</th>
              <th className="px-4 py-3 text-right font-medium">À jour</th>
              <th className="px-4 py-3 text-right font-medium">Partiel</th>
              <th className="px-4 py-3 text-right font-medium">Non à jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {annees.map((a) => (
              <tr key={a.annee} className="transition-colors hover:bg-surface-2/50">
                <td className="num px-4 py-3 font-medium text-foreground">{a.annee}</td>
                <td className="num px-4 py-3 text-right text-muted-foreground">
                  {formatFcfa(a.totalAttendu)}
                </td>
                <td className="num px-4 py-3 text-right font-medium text-foreground">
                  {formatFcfa(a.totalCollecte)}
                </td>
                <td className="num px-4 py-3 text-right text-jade">
                  {formatPourcent(a.tauxRecouvrement)}
                </td>
                <td className="num px-4 py-3 text-right text-muted-foreground">
                  {formatNombre(a.membresParStatut.A_JOUR)}
                </td>
                <td className="num px-4 py-3 text-right text-muted-foreground">
                  {formatNombre(a.membresParStatut.PARTIEL)}
                </td>
                <td className="num px-4 py-3 text-right text-muted-foreground">
                  {formatNombre(a.membresParStatut.NON_A_JOUR)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Vue comparaison                                                            */
/* -------------------------------------------------------------------------- */

function NoteSansBareme({ rapport }: { rapport: RapportAnnee | null }) {
  if (rapport) return null
  return (
    <span className="mt-0.5 block text-[0.65rem] font-normal normal-case tracking-normal text-faint">
      Aucun barème
    </span>
  )
}

function VueComparaison({ data }: { data: ComparaisonPeriodes }) {
  const { rapportA, rapportB, variations, anneeA, anneeB } = data

  const lignes: {
    label: string
    a: string
    b: string
    variation?: number | null
  }[] = [
    {
      label: 'Total attendu',
      a: rapportA ? formatFcfa(rapportA.totalAttendu) : '—',
      b: rapportB ? formatFcfa(rapportB.totalAttendu) : '—',
      variation: variations.totalAttendu,
    },
    {
      label: 'Total collecté',
      a: rapportA ? formatFcfa(rapportA.totalCollecte) : '—',
      b: rapportB ? formatFcfa(rapportB.totalCollecte) : '—',
      variation: variations.totalCollecte,
    },
    {
      label: 'Taux de recouvrement',
      a: rapportA ? formatPourcent(rapportA.tauxRecouvrement) : '—',
      b: rapportB ? formatPourcent(rapportB.tauxRecouvrement) : '—',
      variation: variations.tauxRecouvrement,
    },
    {
      label: 'Membres éligibles',
      a: rapportA ? formatNombre(rapportA.membresEligibles) : '—',
      b: rapportB ? formatNombre(rapportB.membresEligibles) : '—',
    },
    {
      label: 'À jour',
      a: rapportA ? formatNombre(rapportA.membresParStatut.A_JOUR) : '—',
      b: rapportB ? formatNombre(rapportB.membresParStatut.A_JOUR) : '—',
    },
    {
      label: 'Partiel',
      a: rapportA ? formatNombre(rapportA.membresParStatut.PARTIEL) : '—',
      b: rapportB ? formatNombre(rapportB.membresParStatut.PARTIEL) : '—',
    },
    {
      label: 'Non à jour',
      a: rapportA ? formatNombre(rapportA.membresParStatut.NON_A_JOUR) : '—',
      b: rapportB ? formatNombre(rapportB.membresParStatut.NON_A_JOUR) : '—',
    },
  ]

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-[0.7rem] uppercase tracking-[0.1em] text-faint">
              <th className="px-4 py-3 text-left font-medium">Métrique</th>
              <th className="num px-4 py-3 text-right font-medium">
                {anneeA}
                <NoteSansBareme rapport={rapportA} />
              </th>
              <th className="num px-4 py-3 text-right font-medium">
                {anneeB}
                <NoteSansBareme rapport={rapportB} />
              </th>
              <th className="px-4 py-3 text-right font-medium">Variation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {lignes.map((l) => (
              <tr key={l.label} className="transition-colors hover:bg-surface-2/50">
                <td className="px-4 py-3 text-muted-foreground">{l.label}</td>
                <td className="num px-4 py-3 text-right text-foreground">{l.a}</td>
                <td className="num px-4 py-3 text-right text-foreground">{l.b}</td>
                <td className="px-4 py-3 text-right">
                  {l.variation !== undefined ? (
                    <VariationBadge valeur={l.variation} />
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rapports financiers (enrichissement) — évolution multi-années + comparaison de deux
 * années. Réservé ADMIN/PRESIDENT/TRESORIERE/COMMISSAIRE_COMPTES (miroir serveur).
 * S'appuie sur les barèmes existants pour proposer les années disponibles.
 */
export function RapportsPage() {
  const { user, accessToken } = useAuth()

  const [annees, setAnnees] = useState<number[]>([])
  const [chargementAnnees, setChargementAnnees] = useState(true)
  const [mode, setMode] = useState<Mode>('evolution')

  const [debut, setDebut] = useState<number | null>(null)
  const [fin, setFin] = useState<number | null>(null)
  const [anneeA, setAnneeA] = useState<number | null>(null)
  const [anneeB, setAnneeB] = useState<number | null>(null)

  const [rapport, setRapport] = useState<RapportFinancier | null>(null)
  const [comparaison, setComparaison] = useState<ComparaisonPeriodes | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Années disponibles = années ayant un barème configuré.
  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    void baremeApi
      .list(accessToken, controller.signal)
      .then((list) => {
        if (!actif) return
        const ys = [...new Set(list.map((b) => b.annee))].sort((a, b) => a - b)
        setAnnees(ys)
        if (ys.length > 0) {
          setDebut(ys[0])
          setFin(ys[ys.length - 1])
          setAnneeB(ys[ys.length - 1])
          setAnneeA(ys.length > 1 ? ys[ys.length - 2] : ys[0])
        }
      })
      .catch((e) => {
        if (actif && !estAbort(e)) setErreur(messageErreur(e))
      })
      .finally(() => {
        if (actif) setChargementAnnees(false)
      })
    return () => {
      actif = false
      controller.abort()
    }
  }, [accessToken])

  // Chargement du rapport selon le mode et la sélection.
  useEffect(() => {
    if (!accessToken || annees.length === 0) return
    const controller = new AbortController()
    let actif = true
    setErreur(null)

    if (mode === 'evolution') {
      if (debut === null || fin === null || debut > fin) return
      setChargement(true)
      void rapportsApi
        .financier(debut, fin, accessToken, controller.signal)
        .then((r) => {
          if (actif) setRapport(r)
        })
        .catch((e) => {
          if (actif && !estAbort(e)) setErreur(messageErreur(e))
        })
        .finally(() => {
          if (actif) setChargement(false)
        })
    } else {
      if (anneeA === null || anneeB === null) return
      setChargement(true)
      void rapportsApi
        .comparaison(anneeA, anneeB, accessToken, controller.signal)
        .then((r) => {
          if (actif) setComparaison(r)
        })
        .catch((e) => {
          if (actif && !estAbort(e)) setErreur(messageErreur(e))
        })
        .finally(() => {
          if (actif) setChargement(false)
        })
    }

    return () => {
      actif = false
      controller.abort()
    }
  }, [mode, debut, fin, anneeA, anneeB, accessToken, annees.length])

  // Synthèse cumulée sur la plage (mode évolution).
  const synthese = useMemo(() => {
    if (!rapport) return null
    const totAttendu = rapport.annees.reduce((s, a) => s + a.totalAttendu, 0)
    const totCollecte = rapport.annees.reduce((s, a) => s + a.totalCollecte, 0)
    const taux = totAttendu > 0 ? Math.round((totCollecte / totAttendu) * 10000) / 100 : 0
    return { totAttendu, totCollecte, taux, nbAnnees: rapport.annees.length }
  }, [rapport])

  if (!peutVoirRapports(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const optionsAnnee = (filtre?: (a: number) => boolean) =>
    annees.filter(filtre ?? (() => true)).map((a) => (
      <option key={a} value={a}>
        {a}
      </option>
    ))

  return (
    <>
      <PageHeader
        overline="Trésorerie"
        title="Rapports financiers"
        description="Recouvrement par année et comparaison période vs période."
      />

      {chargementAnnees ? (
        <Card className="nk-reveal nk-d2 mt-7 overflow-hidden p-0">
          <RowsSkeleton rows={4} />
        </Card>
      ) : annees.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            icon={BarChart3}
            title="Aucune donnée à analyser"
            className="min-h-[45vh] justify-center"
            description="Aucun barème annuel n’est encore configuré. Les rapports s’appuient sur les années disposant d’un barème."
          />
        </div>
      ) : (
        <>
          {/* Sélecteurs : mode + années */}
          <Card className="nk-reveal nk-d2 mt-7 p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div
                className="inline-flex rounded-xl border border-hairline bg-surface/60 p-1"
                role="tablist"
                aria-label="Mode de rapport"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'evolution'}
                  onClick={() => setMode('evolution')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                    mode === 'evolution'
                      ? 'bg-surface-2 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Évolution
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'comparaison'}
                  onClick={() => setMode('comparaison')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                    mode === 'comparaison'
                      ? 'bg-surface-2 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                  Comparaison
                </button>
              </div>

              {mode === 'evolution' ? (
                <>
                  <Field label="De" className="w-28">
                    <Select
                      value={debut ?? ''}
                      onChange={(e) => setDebut(Number(e.target.value))}
                    >
                      {optionsAnnee((a) => fin === null || a <= fin)}
                    </Select>
                  </Field>
                  <Field label="À" className="w-28">
                    <Select value={fin ?? ''} onChange={(e) => setFin(Number(e.target.value))}>
                      {optionsAnnee((a) => debut === null || a >= debut)}
                    </Select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Année A" className="w-28">
                    <Select
                      value={anneeA ?? ''}
                      onChange={(e) => setAnneeA(Number(e.target.value))}
                    >
                      {optionsAnnee()}
                    </Select>
                  </Field>
                  <Field label="Année B" className="w-28">
                    <Select
                      value={anneeB ?? ''}
                      onChange={(e) => setAnneeB(Number(e.target.value))}
                    >
                      {optionsAnnee()}
                    </Select>
                  </Field>
                </>
              )}
            </div>
          </Card>

          {erreur && (
            <Card className="nk-reveal mt-4 border-terra/30 bg-terra/[0.07] p-5 text-terra">
              {erreur}
            </Card>
          )}

          {/* Contenu */}
          <div className="nk-reveal nk-d3 mt-6">
            {chargement ? (
              <Card className="overflow-hidden p-0">
                <RowsSkeleton rows={5} />
              </Card>
            ) : mode === 'evolution' && rapport ? (
              rapport.annees.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Aucune année configurée sur cette plage"
                  description="Les années sans barème sont ignorées. Élargissez la plage ou configurez les barèmes manquants."
                />
              ) : (
                <div className="space-y-6">
                  {synthese && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <StatCard
                        label="Total collecté"
                        value={formatFcfa(synthese.totCollecte)}
                        hint={`${synthese.nbAnnees} année${synthese.nbAnnees > 1 ? 's' : ''}`}
                        icon={Coins}
                        tone="jade"
                      />
                      <StatCard
                        label="Total attendu"
                        value={formatFcfa(synthese.totAttendu)}
                        icon={Wallet}
                      />
                      <StatCard
                        label="Taux global"
                        value={formatPourcent(synthese.taux)}
                        icon={Percent}
                        tone="brass"
                      />
                    </div>
                  )}
                  <GrapheEvolution annees={rapport.annees} />
                  <TableEvolution annees={rapport.annees} />
                </div>
              )
            ) : mode === 'comparaison' && comparaison ? (
              <VueComparaison data={comparaison} />
            ) : null}
          </div>
        </>
      )}
    </>
  )
}

export default RapportsPage
