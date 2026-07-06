import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  Coins,
  FileSpreadsheet,
  FileText,
  Minus,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  baremeApi,
  rapportsApi,
  downloadRapportFinancier,
  downloadRapportComparaisonMulti,
  messageErreur,
  ApiError,
  type ComparaisonMulti,
  type RapportAnnee,
  type RapportFinancier,
  type VariationsComparaison,
} from '@/lib/api'
import { peutVoirRapports } from '@/lib/roles'
import { formatFcfa, formatNombre, formatPourcent } from '@/lib/format'
import { cn, prefersReducedMotion } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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
  const { t } = useTranslation()
  if (valeur === null) {
    return <span className="text-xs text-faint">{t('rapports.variation.na')}</span>
  }
  if (valeur === 0) {
    return (
      <Badge tone="neutral" size="sm">
        <Minus className="h-3 w-3" aria-hidden="true" />
        {t('rapports.variation.zero')}
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
  const { t } = useTranslation()
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
          <Overline>{t('rapports.graphe.titre')}</Overline>
        </div>
        <div className="flex items-center gap-4 text-xs text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" aria-hidden="true" />
            {t('rapports.graphe.attendu')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-jade to-brass"
              aria-hidden="true"
            />
            {t('rapports.graphe.collecte')}
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
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-[0.7rem] uppercase tracking-[0.1em] text-faint">
              <th className="px-4 py-3 text-left font-medium">{t('rapports.table.annee')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.attendu')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.collecte')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.taux')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.aJour')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.partiel')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('rapports.table.nonAJour')}</th>
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
  const { t } = useTranslation()
  if (rapport) return null
  return (
    <span className="mt-0.5 block text-[0.65rem] font-normal normal-case tracking-normal text-faint">
      {t('rapports.aucunBareme')}
    </span>
  )
}

/** Métriques de la table de comparaison ; `vkey` présent ⇒ ligne portant une variation.
 * `cle` = clé de traduction sous `rapports.metriques.*`. */
type MetriqueDef = {
  cle: string
  valeur: (r: RapportAnnee | null) => string
  vkey?: keyof VariationsComparaison
}

const METRIQUES_COMPARAISON: MetriqueDef[] = [
  { cle: 'totalAttendu', valeur: (r) => (r ? formatFcfa(r.totalAttendu) : '—'), vkey: 'totalAttendu' },
  { cle: 'totalCollecte', valeur: (r) => (r ? formatFcfa(r.totalCollecte) : '—'), vkey: 'totalCollecte' },
  {
    cle: 'tauxRecouvrement',
    valeur: (r) => (r ? formatPourcent(r.tauxRecouvrement) : '—'),
    vkey: 'tauxRecouvrement',
  },
  { cle: 'membresEligibles', valeur: (r) => (r ? formatNombre(r.membresEligibles) : '—') },
  { cle: 'aJour', valeur: (r) => (r ? formatNombre(r.membresParStatut.A_JOUR) : '—') },
  { cle: 'partiel', valeur: (r) => (r ? formatNombre(r.membresParStatut.PARTIEL) : '—') },
  { cle: 'nonAJour', valeur: (r) => (r ? formatNombre(r.membresParStatut.NON_A_JOUR) : '—') },
]

// Cellules de la 1re colonne (Métrique) : collantes à gauche pour rester lisibles au scroll.
const CELLULE_COLLANTE = 'sticky left-0 z-10 border-r border-hairline bg-surface'

/**
 * Table de comparaison multi-années (§10) : une colonne par année + une colonne Δ pour
 * chaque année à partir de la 2e (variation vs la précédente DANS LA LISTE). La 1re colonne
 * (Métrique) est collante et la table défile horizontalement au besoin (mobile / N années).
 */
function VueComparaisonMulti({ data }: { data: ComparaisonMulti }) {
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-hairline text-[0.7rem] uppercase tracking-[0.1em] text-faint">
              <th className={cn(CELLULE_COLLANTE, 'px-4 py-3 text-left font-medium')}>
                {t('rapports.comparaison.metrique')}
              </th>
              {data.annees.map((ac, i) => (
                <Fragment key={ac.annee}>
                  <th className="num px-4 py-3 text-right font-medium">
                    {ac.annee}
                    <NoteSansBareme rapport={ac.rapport} />
                  </th>
                  {i > 0 && <th className="px-4 py-3 text-right font-medium">Δ</th>}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {METRIQUES_COMPARAISON.map((m) => (
              <tr key={m.cle} className="group">
                <td
                  className={cn(
                    CELLULE_COLLANTE,
                    'px-4 py-3 text-muted-foreground transition-colors group-hover:bg-surface-2',
                  )}
                >
                  {t(`rapports.metriques.${m.cle}`)}
                </td>
                {data.annees.map((ac, i) => (
                  <Fragment key={ac.annee}>
                    <td className="num px-4 py-3 text-right text-foreground transition-colors group-hover:bg-surface-2/50">
                      {m.valeur(ac.rapport)}
                    </td>
                    {i > 0 && (
                      <td className="px-4 py-3 text-right transition-colors group-hover:bg-surface-2/50">
                        {m.vkey ? (
                          <VariationBadge valeur={ac.variations ? ac.variations[m.vkey] : null} />
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    )}
                  </Fragment>
                ))}
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
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [annees, setAnnees] = useState<number[]>([])
  const [chargementAnnees, setChargementAnnees] = useState(true)
  const [mode, setMode] = useState<Mode>('evolution')
  const [exportEnCours, setExportEnCours] = useState<'xlsx' | 'pdf' | null>(null)

  const [debut, setDebut] = useState<number | null>(null)
  const [fin, setFin] = useState<number | null>(null)
  // Années comparées (mode Comparaison) — triées, minimum 2, pas de maximum.
  const [anneesComp, setAnneesComp] = useState<number[]>([])

  const [rapport, setRapport] = useState<RapportFinancier | null>(null)
  const [comparaison, setComparaison] = useState<ComparaisonMulti | null>(null)
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
          // Comparaison : par défaut les deux années les plus récentes (si ≥ 2 dispo).
          setAnneesComp(ys.length >= 2 ? [ys[ys.length - 2], ys[ys.length - 1]] : [...ys])
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
      if (anneesComp.length < 2) return
      setChargement(true)
      void rapportsApi
        .comparaisonMulti(anneesComp, accessToken, controller.signal)
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
  }, [mode, debut, fin, anneesComp, accessToken, annees.length])

  // Synthèse cumulée sur la plage (mode évolution).
  const synthese = useMemo(() => {
    if (!rapport) return null
    const totAttendu = rapport.annees.reduce((s, a) => s + a.totalAttendu, 0)
    const totCollecte = rapport.annees.reduce((s, a) => s + a.totalCollecte, 0)
    const taux = totAttendu > 0 ? Math.round((totCollecte / totAttendu) * 10000) / 100 : 0
    return { totAttendu, totCollecte, taux, nbAnnees: rapport.annees.length }
  }, [rapport])

  // Export du rapport courant (fetch authentifié → téléchargement). Le nom de fichier
  // (plage / deux années) est porté par le Content-Disposition du serveur.
  const exporter = async (format: 'xlsx' | 'pdf') => {
    if (!accessToken) return
    setExportEnCours(format)
    try {
      if (mode === 'evolution' && debut !== null && fin !== null) {
        await downloadRapportFinancier(debut, fin, format, accessToken)
      } else if (mode === 'comparaison' && anneesComp.length >= 2) {
        await downloadRapportComparaisonMulti(anneesComp, format, accessToken)
      }
      toast.success(
        t('rapports.export.pret'),
        t('rapports.export.pretDetail', { format: format.toUpperCase() }),
      )
    } catch (e) {
      toast.error(
        t('rapports.export.echec'),
        e instanceof ApiError ? e.message : t('rapports.export.reessayer'),
      )
    } finally {
      setExportEnCours(null)
    }
  }

  const exportDesactive =
    exportEnCours !== null ||
    (mode === 'evolution'
      ? !rapport || rapport.annees.length === 0 || debut === null || fin === null
      : comparaison === null || anneesComp.length < 2)

  // Ajout / retrait d'une année comparée (min. 2, liste maintenue triée).
  const ajouterAnnee = (a: number) =>
    setAnneesComp((prev) => (prev.includes(a) ? prev : [...prev, a].sort((x, y) => x - y)))
  const retirerAnnee = (a: number) =>
    setAnneesComp((prev) => (prev.length <= 2 ? prev : prev.filter((x) => x !== a)))
  const anneesAjoutables = annees.filter((a) => !anneesComp.includes(a))

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
        overline={t('rapports.header.overline')}
        title={t('rapports.header.titre')}
        description={t('rapports.header.description')}
      />

      {chargementAnnees ? (
        <Card className="nk-reveal nk-d2 mt-7 overflow-hidden p-0">
          <RowsSkeleton rows={4} />
        </Card>
      ) : annees.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            icon={BarChart3}
            title={t('rapports.vide.titre')}
            className="min-h-[45vh] justify-center"
            description={t('rapports.vide.description')}
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
                aria-label={t('rapports.mode.aria')}
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
                  {t('rapports.mode.evolution')}
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
                  {t('rapports.mode.comparaison')}
                </button>
              </div>

              {mode === 'evolution' ? (
                <>
                  <Field label={t('rapports.plage.de')} className="w-28">
                    <Select
                      value={debut ?? ''}
                      onChange={(e) => setDebut(Number(e.target.value))}
                    >
                      {optionsAnnee((a) => fin === null || a <= fin)}
                    </Select>
                  </Field>
                  <Field label={t('rapports.plage.a')} className="w-28">
                    <Select value={fin ?? ''} onChange={(e) => setFin(Number(e.target.value))}>
                      {optionsAnnee((a) => debut === null || a >= debut)}
                    </Select>
                  </Field>
                </>
              ) : (
                <div className="flex flex-col">
                  <span className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-[0.1em] text-faint">
                    {t('rapports.comparaison.anneesComparees')}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {anneesComp.map((a) => (
                      <span
                        key={a}
                        className="num inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-2/70 py-1 pl-3 pr-1.5 text-sm text-foreground"
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() => retirerAnnee(a)}
                          disabled={anneesComp.length <= 2}
                          aria-label={t('rapports.comparaison.retirer', { annee: a })}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:text-terra disabled:opacity-30 disabled:hover:text-faint"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    {anneesAjoutables.length > 0 && (
                      <Select
                        value=""
                        aria-label={t('rapports.comparaison.ajouterAria')}
                        className="w-auto pr-8 text-sm"
                        onChange={(e) => {
                          if (e.target.value) ajouterAnnee(Number(e.target.value))
                        }}
                      >
                        <option value="">{t('rapports.comparaison.ajouter')}</option>
                        {anneesAjoutables.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
              )}

              {/* Export du rapport courant — rattaché aux sélecteurs qui le définissent. */}
              <div className="ml-auto flex flex-col">
                <span className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-[0.1em] text-faint">
                  {t('rapports.export.titre')}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={FileSpreadsheet}
                    loading={exportEnCours === 'xlsx'}
                    disabled={exportDesactive}
                    onClick={() => exporter('xlsx')}
                  >
                    {t('rapports.export.excel')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={FileText}
                    loading={exportEnCours === 'pdf'}
                    disabled={exportDesactive}
                    onClick={() => exporter('pdf')}
                  >
                    {t('rapports.export.pdf')}
                  </Button>
                </div>
              </div>
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
                  title={t('rapports.videPlage.titre')}
                  description={t('rapports.videPlage.description')}
                />
              ) : (
                <div className="space-y-6">
                  {synthese && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <StatCard
                        label={t('rapports.synthese.totalCollecte')}
                        value={formatFcfa(synthese.totCollecte)}
                        hint={t('rapports.synthese.annees', { count: synthese.nbAnnees })}
                        icon={Coins}
                        tone="jade"
                      />
                      <StatCard
                        label={t('rapports.synthese.totalAttendu')}
                        value={formatFcfa(synthese.totAttendu)}
                        icon={Wallet}
                      />
                      <StatCard
                        label={t('rapports.synthese.tauxGlobal')}
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
            ) : mode === 'comparaison' ? (
              anneesComp.length < 2 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title={t('rapports.videComparaison.titre')}
                  description={t('rapports.videComparaison.description')}
                />
              ) : comparaison ? (
                <VueComparaisonMulti data={comparaison} />
              ) : null
            ) : null}
          </div>
        </>
      )}
    </>
  )
}

export default RapportsPage
