import { useCallback, useEffect, useState } from 'react'
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
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Field'
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
  const [paiementActif, setPaiementActif] = useState(false)
  // Montant minimum d'un paiement, fourni par le SERVEUR (source unique = PAIEMENT_MONTANT_MIN). Évite
  // tout couplage build-time front/back : plus de variable VITE_ ni de rebuild Vercel à synchroniser.
  const [montantMin, setMontantMin] = useState(100)
  const [paiementEnCours, setPaiementEnCours] = useState<string | null>(null)
  const [paiementCible, setPaiementCible] = useState<ContributionMembre | null>(null)
  const [montantSaisi, setMontantSaisi] = useState('')
  const [erreurMontant, setErreurMontant] = useState<string | null>(null)

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
      // Listes + aperçu carte + disponibilité paiement (best-effort, chargés en parallèle).
      const [c, r, rc, n, ca, pd] = await Promise.all([
        moiApi.contributions(accessToken, controller.signal).catch(() => []),
        moiApi.reunions(accessToken, controller.signal).catch(() => []),
        moiApi.recus(accessToken, controller.signal).catch(() => []),
        notificationsApi.list(accessToken, controller.signal).catch(() => []),
        moiApi.carteApercu(accessToken, controller.signal).catch(() => null),
        moiApi.paiementDisponible(accessToken, controller.signal).catch(() => ({ actif: false, montantMin: 100 })),
      ])
      if (!actif) return
      setContributions(c)
      setReunions(r)
      setRecus(rc)
      setNotifications(n)
      setCarteApercu(ca)
      setPaiementActif(pd.actif)
      setMontantMin(pd.montantMin ?? 100)
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

  // Sonde le statut d'un paiement quelques fois (le webhook peut arriver avec un léger décalage), puis
  // rafraîchit les finances sur REUSSI. `verifierStatut` côté serveur reste la source de vérité. PARTAGÉ
  // par les DEUX flux : retour de redirection (Fapshi, checkout hébergé) ET collecte directe (CamPay,
  // invite MoMo sur le téléphone → aucune redirection). Borné à 8 essais ; libère le spinner à la fin.
  const sonderPaiement = useCallback(
    (id: string) => {
      if (!accessToken) return
      let essais = 0
      const sonder = async () => {
        try {
          const { statut } = await moiApi.statutPaiement(id, accessToken)
          if (statut === 'REUSSI') {
            toast.success(t('monEspace.paiement.succes'))
            const [s, c] = await Promise.all([
              moiApi.situation(accessToken).catch(() => null),
              moiApi.contributions(accessToken).catch(() => null),
            ])
            if (s) setSituation(s)
            if (c) setContributions(c)
            setPaiementEnCours(null)
            return
          }
          if (statut === 'ECHEC' || statut === 'EXPIRE') {
            toast.error(t('monEspace.paiement.echecPaiement'))
            setPaiementEnCours(null)
            return
          }
        } catch {
          /* transitoire → on retente */
        }
        if (++essais < 8) setTimeout(sonder, 2500)
        else {
          toast.info(t('monEspace.paiement.enAttente'))
          setPaiementEnCours(null)
        }
      }
      void sonder()
    },
    [accessToken, toast, t],
  )

  // Retour de la page de paiement hébergée (Fapshi) : si un paiement était en cours (id mémorisé AVANT
  // la redirection, en sessionStorage car la redirection recharge la page), on sonde son statut.
  useEffect(() => {
    const id = sessionStorage.getItem('nkoni_paiement')
    if (!id) return
    sessionStorage.removeItem('nkoni_paiement')
    sonderPaiement(id)
  }, [sonderPaiement])

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

  // Ouvrir le panneau = « vu » : on marque toutes les non-lues comme lues côté serveur puis on met
  // à jour l'état local (le compteur retombe à 0). Best-effort : un échec laisse l'état inchangé, on
  // réessaiera à la prochaine ouverture. Fermer ne redéclenche rien (garde `ouvre && …`).
  const basculerRappels = () => {
    const ouvre = !rappelsOuverts
    setRappelsOuverts(ouvre)
    if (ouvre && accessToken && notifications.some((n) => !n.lu)) {
      void notificationsApi
        .marquerToutesLues(accessToken)
        .then(() => setNotifications((prev) => prev.map((n) => (n.lu ? n : { ...n, lu: true }))))
        .catch(() => {
          /* silencieux : réessai à la prochaine ouverture */
        })
    }
  }

  // Ouvre la modale de paiement d'une contribution : le membre CHOISIT le montant (défaut = reste dû).
  // Permet les paiements PARTIELS (on verse ce qu'on a — usage courant en tontine). La borne haute est
  // le reste dû, la borne basse le minimum ; le serveur re-vérifie les deux (jamais confiance au client).
  const ouvrirPaiement = (c: ContributionMembre) => {
    const reste = Math.max(0, c.montantAttendu - c.montantValorise)
    if (reste < montantMin) return
    setPaiementCible(c)
    setMontantSaisi(String(reste)) // défaut : tout régler
    setErreurMontant(null)
  }

  // Valide le montant saisi puis lance la collecte. Bornes : [montantMin (serveur) .. reste dû].
  const confirmerMontant = () => {
    if (!paiementCible) return
    const reste = Math.max(0, paiementCible.montantAttendu - paiementCible.montantValorise)
    const montant = Number(montantSaisi)
    if (!Number.isInteger(montant) || montant < montantMin || montant > reste) {
      setErreurMontant(t('monEspace.paiement.montantInvalide'))
      return
    }
    const contributionId = paiementCible.id
    setPaiementCible(null)
    void lancerPaiement(contributionId, montant)
  }

  // Lance le règlement en ligne du montant choisi. Deux flux selon le PSP, distingués par la présence
  // d'une URL de redirection :
  //  - checkout hébergé (Fapshi) → `urlPaiement` présente : on mémorise l'id et on redirige ;
  //  - collecte directe (CamPay) → PAS d'URL : l'invite MoMo part sur le téléphone du membre, on l'en
  //    informe et on SONDE le statut sur place (pas de rechargement de page).
  const lancerPaiement = async (contributionId: string, montant: number) => {
    if (!accessToken) return
    setPaiementEnCours(contributionId)
    try {
      const r = await moiApi.demarrerPaiement(contributionId, montant, accessToken)
      if (r.urlPaiement) {
        sessionStorage.setItem('nkoni_paiement', r.paiementId)
        window.location.href = r.urlPaiement
      } else {
        // Collecte directe : le membre doit valider le paiement sur son téléphone, puis on sonde.
        toast.info(t('monEspace.paiement.validezTelephone'))
        sonderPaiement(r.paiementId)
      }
    } catch (e) {
      toast.error(t('monEspace.paiement.echec'), e instanceof ApiError ? e.message : '')
      setPaiementEnCours(null)
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
    // Colonne « Payer » — seulement si le paiement en ligne est actif pour l'org ET qu'il reste au
    // moins le minimum Fapshi (100 XAF) à régler sur l'année.
    ...(paiementActif
      ? [
          {
            key: 'payer',
            header: '',
            align: 'right' as const,
            cell: (c: ContributionMembre) =>
              Math.max(0, c.montantAttendu - c.montantValorise) >= montantMin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={CreditCard}
                  loading={paiementEnCours === c.id}
                  onClick={() => ouvrirPaiement(c)}
                >
                  {t('monEspace.paiement.payer')}
                </Button>
              ) : null,
          },
        ]
      : []),
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
            onClick={basculerRappels}
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

      {/* Modale de paiement — le membre CHOISIT le montant (défaut = reste dû, borné minimum..reste).
          Autorise les paiements partiels ; le serveur re-vérifie les deux bornes (jamais le client). */}
      <Modal
        open={paiementCible !== null}
        onClose={() => setPaiementCible(null)}
        title={paiementCible ? t('monEspace.paiement.titre', { annee: paiementCible.annee }) : ''}
      >
        {paiementCible && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t('monEspace.paiement.resteDu')}</span>
              <Montant
                value={Math.max(0, paiementCible.montantAttendu - paiementCible.montantValorise)}
                className="font-medium"
              />
            </div>
            <Field label={t('monEspace.paiement.montantLabel')} hint={t('monEspace.paiement.montantAide')}>
              <Input
                type="number"
                inputMode="numeric"
                min={montantMin}
                max={Math.max(0, paiementCible.montantAttendu - paiementCible.montantValorise)}
                step={1}
                value={montantSaisi}
                onChange={(e) => {
                  setMontantSaisi(e.target.value)
                  setErreurMontant(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmerMontant()
                  }
                }}
              />
            </Field>
            {erreurMontant && (
              <p role="alert" className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra">
                {erreurMontant}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPaiementCible(null)}>
                {t('monEspace.paiement.annuler')}
              </Button>
              <Button type="button" icon={CreditCard} onClick={confirmerMontant}>
                {t('monEspace.paiement.confirmer')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MonEspacePage
