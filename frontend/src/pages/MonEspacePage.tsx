import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  ArrowDownCircle,
  CircleDollarSign,
  CalendarDays,
  FileText,
  Download,
  UserX,
  Ban,
  CreditCard,
  Bell,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  moiApi,
  recusApi,
  notificationsApi,
  ApiError,
  messageErreur,
  type SituationMembre,
  type ContributionMembre,
  type ReunionAVenir,
  type RecuMembre,
  type Notification,
  type CarteApercu,
} from '@/lib/api'
import { formatMontant, formatPourcent } from '@/lib/format'
import { cn, formatDate, ouvrirBlobPdf } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Montant } from '@/components/ui/Montant'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { CarteMembre } from '@/components/membres/CarteMembre'
import { TypeReunionBadge } from '@/components/reunions/StatutBadges'
import type { StatutContribution, StatutMembre, TypeReunion } from '@/lib/api'

export function MonEspacePage() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()

  const [situation, setSituation] = useState<SituationMembre | null>(null)
  const [contributions, setContributions] = useState<ContributionMembre[]>([])
  const [reunions, setReunions] = useState<ReunionAVenir[]>([])
  const [recus, setRecus] = useState<RecuMembre[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [carteApercu, setCarteApercu] = useState<CarteApercu | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sansFiche, setSansFiche] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [carteEnCours, setCarteEnCours] = useState(false)
  const [annulesOuverts, setAnnulesOuverts] = useState(false)
  const [rappelsOuverts, setRappelsOuverts] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    let objectUrl: string | null = null
    setLoading(true)
    void (async () => {
      try {
        const s = await moiApi.situation(accessToken, controller.signal)
        if (!actif) return
        setSituation(s)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!actif) return
        // 404 = ce compte n'a pas de fiche membre liée ; toute autre erreur = panne réelle
        // (réseau/500) → état d'erreur distinct, pour ne pas la présenter comme « aucune fiche ».
        if (e instanceof ApiError && e.status === 404) setSansFiche(true)
        else setErreur(messageErreur(e))
        setLoading(false)
        return
      }
      // Listes + aperçu carte (best-effort, chargés en parallèle).
      const [c, r, rc, n, ca] = await Promise.all([
        moiApi.contributions(accessToken, controller.signal).catch(() => []),
        moiApi.reunions(accessToken, controller.signal).catch(() => []),
        moiApi.recus(accessToken, controller.signal).catch(() => []),
        notificationsApi.list(accessToken, controller.signal).catch(() => []),
        moiApi.carteApercu(accessToken, controller.signal).catch(() => null),
      ])
      if (!actif) return
      setContributions(c)
      setReunions(r)
      setRecus(rc)
      setNotifications(n)
      setCarteApercu(ca)
      setLoading(false)
      // Photo (proxy authentifié → blob) seulement si le membre en a une ; sinon on retombe sur
      // les initiales dans la carte. Best-effort : un échec ne casse pas la page.
      if (ca?.aPhoto) {
        try {
          const blob = await moiApi.photo(accessToken)
          if (!actif) return
          objectUrl = URL.createObjectURL(blob)
          setPhotoUrl(objectUrl)
        } catch {
          /* photo indisponible → initiales */
        }
      }
    })()
    return () => {
      actif = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accessToken])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-56 rounded-2xl" />
      </div>
    )
  }

  if (erreur) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={t('monEspace.titre')} description={t('monEspace.sousTitre')} />
        <Card role="alert" className="mt-6 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {erreur}
        </Card>
      </div>
    )
  }

  if (sansFiche || !situation) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={t('monEspace.titre')} description={t('monEspace.sousTitre')} />
        <Card className="mt-6 p-6">
          <EmptyState icon={UserX} title={t('monEspace.aucuneFiche.titre')} description={t('monEspace.aucuneFiche.texte')} />
        </Card>
      </div>
    )
  }

  const { membre, cotisation } = situation
  const reste = Math.max(0, cotisation.totalDu - cotisation.totalVerse)
  // Progression versé / dû → sens visuel de complétion (célébrée à 100 %). Rien dû = 100 % (à jour).
  const pct =
    cotisation.totalDu > 0
      ? Math.min(100, Math.round((cotisation.totalVerse / cotisation.totalDu) * 100))
      : 100

  // Statut d'UNE année (mêmes seuils que le calcul global) → badge par ligne dans le tableau.
  const statutAnnee = (c: ContributionMembre): StatutContribution =>
    c.montantValorise >= c.montantAttendu ? 'A_JOUR' : c.montantValorise > 0 ? 'PARTIEL' : 'NON_A_JOUR'

  const telechargerRecu = async (recuId: string) => {
    if (!accessToken) return
    try {
      const blob = await recusApi.telecharger(recuId, accessToken)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(t('monEspace.recus.indisponible'), e instanceof ApiError ? e.message : '')
    }
  }

  const telechargerCarte = async () => {
    if (!accessToken) return
    setCarteEnCours(true)
    try {
      ouvrirBlobPdf(await moiApi.carte(accessToken))
    } catch (e) {
      toast.error(t('monEspace.carte.erreur'), e instanceof ApiError ? e.message : '')
    } finally {
      setCarteEnCours(false)
    }
  }

  // Reçus ACTIFS (téléchargeables) séparés des ANNULÉS : les actifs dans le tableau, les annulés
  // repliés dans un groupe pour que les reçus utiles ne soient pas noyés.
  const recusActifs = recus.filter((r) => r.annuleLe === null)
  const recusAnnules = recus.filter((r) => r.annuleLe !== null)
  const notifsNonLues = notifications.filter((n) => !n.lu).length

  const colContributions: Column<ContributionMembre>[] = [
    { key: 'annee', header: t('monEspace.contributions.annee'), numeric: true, cell: (c) => c.annee },
    { key: 'attendu', header: t('monEspace.contributions.attendu'), numeric: true, cell: (c) => formatMontant(c.montantAttendu) },
    { key: 'verse', header: t('monEspace.contributions.verse'), numeric: true, cell: (c) => formatMontant(c.montantVerse) },
    {
      key: 'valorise',
      header: t('monEspace.contributions.valorise'),
      numeric: true,
      cell: (c) => <span className="text-jade">{formatMontant(c.montantValorise)}</span>,
    },
    {
      key: 'statut',
      header: t('monEspace.contributions.statut'),
      align: 'right',
      cell: (c) => <StatutCotisationBadge statut={statutAnnee(c)} size="sm" />,
    },
  ]

  const colRecus: Column<RecuMembre>[] = [
    {
      key: 'numero',
      header: t('monEspace.recus.numero'),
      // Le badge est ce qui distingue « ce reçu a été annulé » d'une panne de téléchargement :
      // sans lui, la mention « indisponible » de la dernière colonne se lit comme un incident.
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="num">{r.numero}</span>
          {r.annuleLe !== null && (
            <Badge tone="neutral" size="sm">
              <Ban className="h-3 w-3" aria-hidden="true" />
              {t('monEspace.recus.annule')}
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'date', header: t('monEspace.recus.date'), cell: (r) => formatDate(r.date) },
    { key: 'montant', header: t('monEspace.recus.montant'), numeric: true, cell: (r) => formatMontant(r.montant) },
    {
      key: 'telecharger',
      header: '',
      align: 'right',
      cell: (r) =>
        r.telechargeable ? (
          <Button type="button" variant="ghost" size="sm" icon={Download} onClick={() => telechargerRecu(r.id)}>
            {t('monEspace.recus.telecharger')}
          </Button>
        ) : (
          <span className="text-xs text-faint">{t('monEspace.recus.indisponible')}</span>
        ),
    },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t('monEspace.titre')}
        description={t('monEspace.sousTitre')}
      />

      {/* Ma situation */}
      <Card className="nk-reveal nk-d2 mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Overline>{t('monEspace.situation.titre')}</Overline>
          <div className="flex flex-wrap items-center gap-2">
            <StatutMembreBadge statut={membre.statut as StatutMembre} size="sm" />
            <StatutCotisationBadge statut={cotisation.statut as StatutContribution} size="sm" />
          </div>
        </div>
        <p className="mt-1 text-lg font-medium text-foreground">
          {membre.nom} <span className="text-muted-foreground">{membre.prenom}</span>
        </p>
        <p className="mt-0.5 text-sm text-faint">
          {t('monEspace.situation.branche')} : {membre.branche ?? '—'} ·{' '}
          {t('monEspace.situation.anneeAdhesion')} : <span className="num">{membre.anneeAdhesion}</span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('monEspace.situation.totalDu')} value={<Montant value={cotisation.totalDu} />} icon={CircleDollarSign} />
          <StatCard label={t('monEspace.situation.totalVerse')} value={<Montant value={cotisation.totalVerse} />} tone="jade" icon={ArrowDownCircle} />
          <StatCard label={t('monEspace.situation.reste')} value={<Montant value={reste} />} tone={reste > 0 ? 'brass' : 'jade'} icon={Wallet} />
        </div>

        {/* Progression versé/dû — transforme les trois chiffres en un sens visuel de complétion,
            célébré quand le membre est à jour (barre + compteur jade + remerciement). */}
        {cotisation.totalDu > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('monEspace.situation.progression')}</span>
              <span className={cn('num font-medium', reste === 0 ? 'text-jade' : 'text-foreground')}>
                {formatPourcent(pct)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={cotisation.totalVerse}
              aria-valuemin={0}
              aria-valuemax={cotisation.totalDu}
              aria-label={t('monEspace.situation.progression')}
            >
              <div
                className={cn('h-full rounded-full transition-all', reste === 0 ? 'bg-jade' : 'bg-brass')}
                style={{ width: `${pct}%` }}
              />
            </div>
            {reste === 0 && (
              <p className="mt-2 text-xs font-medium text-jade">{t('monEspace.situation.aJourMerci')}</p>
            )}
          </div>
        )}
      </Card>

      {/* Ma carte de membre — rendu visuel (« voir sa carte ») + téléchargement PDF. */}
      {carteApercu && (
        <Card className="nk-reveal mt-4 p-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('monEspace.carte.titre')}</Overline>
          </div>
          <div className="mt-4 max-w-md">
            <CarteMembre
              apercu={carteApercu}
              photoUrl={photoUrl}
              onTelecharger={telechargerCarte}
              telechargement={carteEnCours}
            />
          </div>
        </Card>
      )}

      {/* Mes contributions */}
      <Card className="nk-reveal nk-d3 mt-4 p-6">
        <Overline>{t('monEspace.contributions.titre')}</Overline>
        {contributions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.contributions.aucune')}</p>
        ) : (
          <div className="mt-4">
            <DataTable columns={colContributions} rows={contributions} rowKey={(c) => c.id} />
          </div>
        )}
      </Card>

      {/* Mes notifications — repliées par défaut (le mur de confirmations n'a pas sa place sur
          l'accueil) ; l'en-tête porte le compteur de non-lus et déplie la liste. */}
      {notifications.length > 0 && (
        <Card className="nk-reveal mt-4 p-6">
          <button
            type="button"
            onClick={() => setRappelsOuverts((o) => !o)}
            aria-expanded={rappelsOuverts}
            className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            <Bell className="h-4 w-4 text-brass" aria-hidden="true" />
            <Overline>{t('monEspace.rappels.titre')}</Overline>
            {notifsNonLues > 0 && (
              <Badge tone="brass" size="sm">
                {t('monEspace.rappels.nonLus', { count: notifsNonLues })}
              </Badge>
            )}
            <ChevronDown
              className={cn('ml-auto h-4 w-4 text-faint transition-transform', rappelsOuverts && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {rappelsOuverts && (
          <ul className="mt-4 space-y-2">
            {notifications.slice(0, 8).map((n) => (
              <li
                key={n.id}
                className={cn(
                  'rounded-xl border bg-surface-2/40 p-3.5',
                  n.lu ? 'border-hairline' : 'border-brass/30',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{n.titre}</p>
                  {!n.lu && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brass"
                      aria-label={t('monEspace.rappels.nonLu')}
                    />
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-faint">{formatDate(n.dateCreation, { dateStyle: 'long' })}</p>
              </li>
            ))}
          </ul>
          )}
        </Card>
      )}

      {/* Réunions à venir */}
      <Card className="nk-reveal nk-d4 mt-4 p-6">
        <Overline>{t('monEspace.reunions.titre')}</Overline>
        {reunions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.reunions.aucune')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {reunions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/40 p-3.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{formatDate(r.date, { dateStyle: 'long' })}</p>
                  <p className="mt-0.5 text-xs text-faint">{t('monEspace.reunions.lieu')} : {r.lieu}</p>
                </div>
                <TypeReunionBadge type={r.type as TypeReunion} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Mes reçus */}
      <Card className="nk-reveal nk-d5 mt-4 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('monEspace.recus.titre')}</Overline>
        </div>
        {recus.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('monEspace.recus.aucun')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {recusActifs.length > 0 ? (
              <DataTable columns={colRecus} rows={recusActifs} rowKey={(r) => r.id} />
            ) : (
              <p className="text-sm text-faint">{t('monEspace.recus.aucunActif')}</p>
            )}

            {/* Reçus annulés : repliés par défaut (trace, pas d'action possible) pour que les reçus
                téléchargeables restent au premier plan. */}
            {recusAnnules.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-hairline">
                <button
                  type="button"
                  onClick={() => setAnnulesOuverts((o) => !o)}
                  aria-expanded={annulesOuverts}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass"
                >
                  <span>{t('monEspace.recus.annulesGroupe', { count: recusAnnules.length })}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', annulesOuverts && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
                {annulesOuverts && (
                  <div className="border-t border-hairline">
                    <DataTable
                      columns={colRecus}
                      rows={recusAnnules}
                      rowKey={(r) => r.id}
                      rowClassName={() => 'text-muted-foreground'}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export default MonEspacePage
