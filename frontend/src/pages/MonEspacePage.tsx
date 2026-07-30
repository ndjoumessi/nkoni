import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  ArrowDownCircle,
  CircleDollarSign,
  CalendarDays,
  FileText,
  Download,
  Eye,
  ExternalLink,
  UserX,
  Ban,
  CreditCard,
  Bell,
  ChevronDown,
  Vote,
  RefreshCw,
  Gavel,
  HandHeart,
  Trophy,
  Check,
  CheckCheck,
  Trash2,
  Clock,
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
  type StatutPresence,
  type ResolutionOuverte,
  type SensVote,
  type RecuMembre,
  type RecuDetail,
  type Notification,
  type CarteApercu,
  type AmendeMembre,
  type CagnotteMembre,
  type TontineMembre,
  type TypeNotification,
} from '@/lib/api'
import { formatMontant, formatPourcent } from '@/lib/format'
import { cn, formatDate, ouvrirBlobPdf } from '@/lib/utils'
import { cleI18n } from '@/lib/i18n'
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
import { Tabs, type TabOption } from '@/components/ui/Tabs'
import { tabId, panelId } from '@/components/ui/tabs-ids'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { CarteMembre } from '@/components/membres/CarteMembre'
import { TypeReunionBadge } from '@/components/reunions/StatutBadges'
import type { StatutContribution, StatutMembre, TypeReunion } from '@/lib/api'

/** Ordre d'affichage des réponses RSVP + ton de couleur (jeton) par statut. */
const RSVP_OPTIONS: StatutPresence[] = ['PRESENT', 'EXCUSE', 'ABSENT']
const RSVP_TON: Record<StatutPresence, string> = {
  PRESENT: '--jade',
  EXCUSE: '--amber',
  ABSENT: '--terra',
}

/** Ordre d'affichage des sens de vote + ton de couleur (jeton) par sens. */
const VOTE_OPTIONS: SensVote[] = ['POUR', 'CONTRE', 'ABSTENTION']
const VOTE_TON: Record<SensVote, string> = {
  POUR: '--jade',
  CONTRE: '--terra',
  ABSTENTION: '--amber',
}

/** Icône + ton (jeton) par TYPE de notification → rendu visuel différencié dans la liste. */
const NOTIF_ICONE: Record<TypeNotification, typeof Bell> = {
  VERSEMENT_RECU: ArrowDownCircle,
  COTISATION_RETARD: Clock,
  REUNION_RAPPEL: CalendarDays,
}
const NOTIF_TON: Record<TypeNotification, string> = {
  VERSEMENT_RECU: '--jade',
  COTISATION_RETARD: '--terra',
  REUNION_RAPPEL: '--brass',
}

/** Namespace d'id pour la paire onglet ↔ panneau (aria-controls ↔ aria-labelledby). */
const TABS_ID = 'monEspace'

export function MonEspacePage() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()

  const [situation, setSituation] = useState<SituationMembre | null>(null)
  const [contributions, setContributions] = useState<ContributionMembre[]>([])
  const [reunions, setReunions] = useState<ReunionAVenir[]>([])
  const [resolutions, setResolutions] = useState<ResolutionOuverte[]>([])
  const [recus, setRecus] = useState<RecuMembre[]>([])
  const [amendes, setAmendes] = useState<AmendeMembre[]>([])
  const [cagnottes, setCagnottes] = useState<CagnotteMembre[]>([])
  const [tontines, setTontines] = useState<TontineMembre[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [carteApercu, setCarteApercu] = useState<CarteApercu | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sansFiche, setSansFiche] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [carteEnCours, setCarteEnCours] = useState(false)
  const [annulesOuverts, setAnnulesOuverts] = useState(false)
  const [rappelsOuverts, setRappelsOuverts] = useState(false)
  const [rsvpEnCours, setRsvpEnCours] = useState<string | null>(null)
  const [voteEnCours, setVoteEnCours] = useState<string | null>(null)
  const [paiementActif, setPaiementActif] = useState(false)
  // Onglet actif de la page (segmentation §3b). Défaut « aperçu ».
  const [tab, setTab] = useState('apercu')
  // Montant minimum d'un paiement, fourni par le SERVEUR (source unique = PAIEMENT_MONTANT_MIN). Évite
  // tout couplage build-time front/back : plus de variable VITE_ ni de rebuild Vercel à synchroniser.
  const [montantMin, setMontantMin] = useState(100)
  const [paiementEnCours, setPaiementEnCours] = useState<string | null>(null)
  const [paiementCible, setPaiementCible] = useState<ContributionMembre | null>(null)
  const [montantSaisi, setMontantSaisi] = useState('')
  const [erreurMontant, setErreurMontant] = useState<string | null>(null)
  // Aperçu d'un reçu en modale : le reçu ciblé + son DÉTAIL (données, rendu HTML natif ; null tant
  // qu'il charge). Plus d'iframe PDF — le PDF reste accessible via « Ouvrir » / « Télécharger ».
  const [recuApercu, setRecuApercu] = useState<RecuMembre | null>(null)
  const [recuDetail, setRecuDetail] = useState<RecuDetail | null>(null)

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
      const [c, r, rc, n, ca, pd, ro, am, cg, tn] = await Promise.all([
        moiApi.contributions(accessToken, controller.signal).catch(() => []),
        moiApi.reunions(accessToken, controller.signal).catch(() => []),
        moiApi.recus(accessToken, controller.signal).catch(() => []),
        notificationsApi.list(accessToken, controller.signal).catch(() => []),
        moiApi.carteApercu(accessToken, controller.signal).catch(() => null),
        moiApi.paiementDisponible(accessToken, controller.signal).catch(() => ({ actif: false, montantMin: 100 })),
        moiApi.resolutionsOuvertes(accessToken, controller.signal).catch(() => []),
        moiApi.amendes(accessToken, controller.signal).catch(() => []),
        moiApi.cagnottes(accessToken, controller.signal).catch(() => []),
        moiApi.tontines(accessToken, controller.signal).catch(() => []),
      ])
      if (!actif) return
      setContributions(c)
      setReunions(r)
      setResolutions(ro)
      setRecus(rc)
      setAmendes(am)
      setCagnottes(cg)
      setTontines(tn)
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

  // RSVP : le membre pose SA réponse de présence à une réunion à venir (MAJ optimiste + toast).
  const repondreRsvp = useCallback(
    async (reunionId: string, statut: StatutPresence) => {
      if (!accessToken) return
      const precedent = reunions
      setRsvpEnCours(reunionId)
      setReunions((rs) => rs.map((r) => (r.id === reunionId ? { ...r, monStatut: statut } : r)))
      try {
        await moiApi.rsvp(reunionId, statut, accessToken)
        toast.success(t('monEspace.reunions.rsvpEnregistre'))
      } catch (e) {
        setReunions(precedent) // rollback
        toast.error(messageErreur(e))
      } finally {
        setRsvpEnCours(null)
      }
    },
    [accessToken, reunions, toast, t],
  )

  // Vote : le membre exprime son sens sur une résolution ouverte (MAJ optimiste + toast).
  const voter = useCallback(
    async (resolutionId: string, sens: SensVote) => {
      if (!accessToken) return
      const precedent = resolutions
      setVoteEnCours(resolutionId)
      setResolutions((rs) => rs.map((r) => (r.id === resolutionId ? { ...r, monVote: sens } : r)))
      try {
        await moiApi.voterResolution(resolutionId, sens, accessToken)
        toast.success(t('monEspace.votes.enregistre'))
      } catch (e) {
        setResolutions(precedent) // rollback
        toast.error(messageErreur(e))
      } finally {
        setVoteEnCours(null)
      }
    },
    [accessToken, resolutions, toast, t],
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

  // APERÇU en MODALE : on charge le DÉTAIL (données JSON) et on le rend en HTML natif — bien plus
  // fiable que le PDF en iframe sur mobile. Le PDF reste accessible via « Ouvrir »/« Télécharger ».
  const voirRecu = async (recu: RecuMembre) => {
    if (!accessToken) return
    setRecuApercu(recu)
    setRecuDetail(null)
    try {
      setRecuDetail(await moiApi.recuDetail(recu.id, accessToken))
    } catch (e) {
      toast.error(t('monEspace.recus.indisponible'), e instanceof ApiError ? e.message : '')
      setRecuApercu(null)
    }
  }
  const fermerApercuRecu = () => {
    setRecuDetail(null)
    setRecuApercu(null)
  }
  // Ouvre le PDF officiel dans un nouvel onglet (secondaire — l'aperçu HTML suffit d'ordinaire).
  const ouvrirPdfRecu = async (recuId: string) => {
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

  // TÉLÉCHARGEMENT : force l'enregistrement du fichier (attribut `download`), distinct de l'aperçu.
  const telechargerRecu = async (recu: RecuMembre) => {
    if (!accessToken) return
    try {
      const blob = await recusApi.telecharger(recu.id, accessToken)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${recu.numero}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(t('monEspace.recus.indisponible'), e instanceof ApiError ? e.message : '')
    }
  }

  // Simple bascule du panneau. La lecture n'est PLUS automatique à l'ouverture : le membre
  // contrôle chaque notification (marquer lu / supprimer) ou tout marquer d'un geste explicite.
  const basculerRappels = () => setRappelsOuverts((o) => !o)

  // Gestion fine (MAJ optimiste + rollback sur échec). Marquer UNE lue.
  const marquerNotifLue = async (id: string) => {
    if (!accessToken) return
    const precedent = notifications
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, lu: true } : n)))
    try {
      await notificationsApi.marquerLue(id, accessToken)
    } catch (e) {
      setNotifications(precedent)
      toast.error(messageErreur(e))
    }
  }
  // Supprimer (écarter) UNE notification.
  const supprimerNotif = async (id: string) => {
    if (!accessToken) return
    const precedent = notifications
    setNotifications((ns) => ns.filter((n) => n.id !== id))
    try {
      await notificationsApi.supprimer(id, accessToken)
    } catch (e) {
      setNotifications(precedent)
      toast.error(messageErreur(e))
    }
  }
  // Tout marquer comme lu (geste explicite).
  const toutMarquerLu = async () => {
    if (!accessToken) return
    const precedent = notifications
    setNotifications((ns) => ns.map((n) => (n.lu ? n : { ...n, lu: true })))
    try {
      await notificationsApi.marquerToutesLues(accessToken)
    } catch (e) {
      setNotifications(precedent)
      toast.error(messageErreur(e))
    }
  }

  // Ouvre la modale de paiement d'une contribution : le membre CHOISIT le montant (défaut = reste dû).
  // Permet les paiements PARTIELS (on verse ce qu'on a — usage courant en tontine). La borne haute est
  // le reste dû, la borne basse le minimum ; le serveur re-vérifie les deux (jamais confiance au client).
  const ouvrirPaiement = (c: ContributionMembre) => {
    const resteC = Math.max(0, c.montantAttendu - c.montantValorise)
    if (resteC < montantMin) return
    setPaiementCible(c)
    setMontantSaisi(String(resteC)) // défaut : tout régler
    setErreurMontant(null)
  }

  // Valide le montant saisi puis lance la collecte. Bornes : [montantMin (serveur) .. reste dû].
  const confirmerMontant = () => {
    if (!paiementCible) return
    const resteC = Math.max(0, paiementCible.montantAttendu - paiementCible.montantValorise)
    const montant = Number(montantSaisi)
    if (!Number.isInteger(montant) || montant < montantMin || montant > resteC) {
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
  // Le paiement en ligne peut-il régler le reste dû global ? (CTA principal « Payer le reste »).
  const peutPayerReste = paiementActif && reste >= montantMin
  // 1re contribution encore due (cible du CTA global) : on ouvre la modale dessus.
  const contribAPayer = contributions.find((c) => c.montantAttendu - c.montantValorise >= montantMin)

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
          <div className="flex items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" icon={Eye} onClick={() => voirRecu(r)}>
              {t('monEspace.recus.voir')}
            </Button>
            <Button type="button" variant="ghost" size="sm" icon={Download} onClick={() => telechargerRecu(r)}>
              {t('monEspace.recus.telecharger')}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-faint">{t('monEspace.recus.indisponible')}</span>
        ),
    },
  ]

  // Onglets : Tontines n'apparaît que si le membre participe à au moins une tontine (bar plus propre
  // pour les nombreux membres qui n'en ont pas). Amendes/cagnottes vivent dans « Aperçu ».
  const tabsOptions: TabOption[] = [
    { value: 'apercu', label: t('monEspace.tabs.apercu') },
    { value: 'contributions', label: t('monEspace.tabs.contributions') },
    ...(tontines.length > 0 ? [{ value: 'tontines', label: t('monEspace.tabs.tontines') }] : []),
    { value: 'recus', label: t('monEspace.tabs.recus') },
  ]
  // L'onglet actif peut disparaître (ex. Tontines vidé) → repli sur « aperçu ».
  const tabActif = tabsOptions.some((o) => o.value === tab) ? tab : 'apercu'

  /* ---- Sections (assignées à des consts pour composer les panneaux d'onglets) ---- */

  const blocSituation = (
    <Card className="nk-reveal nk-d2 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Overline>{t('monEspace.situation.titre')}</Overline>
        {/* Statut MEMBRE seulement : le statut de COTISATION est déjà porté par la carte (rail) et
            par la barre de progression + reste + CTA ci-dessous — inutile de répéter « Partiel ». */}
        <StatutMembreBadge statut={membre.statut as StatutMembre} size="sm" />
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
          {reste === 0 ? (
            <p className="mt-2 text-xs font-medium text-jade">{t('monEspace.situation.aJourMerci')}</p>
          ) : (
            // CTA PRINCIPAL du membre : régler le reste dû. Dégradé émeraude→or (variante `brass`),
            // ouvre la modale sur la 1re contribution due. N'apparaît que si le paiement est actif.
            peutPayerReste &&
            contribAPayer && (
              <div className="mt-4">
                <Button
                  type="button"
                  icon={CreditCard}
                  loading={paiementEnCours === contribAPayer.id}
                  onClick={() => ouvrirPaiement(contribAPayer)}
                >
                  {t('monEspace.paiement.payerReste', { montant: formatMontant(reste) })}
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </Card>
  )

  const blocCarte = carteApercu && (
    <Card className="nk-reveal p-6">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('monEspace.carte.titre')}</Overline>
      </div>
      <div className="mt-4 max-w-md">
        <CarteMembre apercu={carteApercu} photoUrl={photoUrl} onTelecharger={telechargerCarte} telechargement={carteEnCours} />
      </div>
    </Card>
  )

  const blocNotifications = notifications.length > 0 && (
    <Card className="nk-reveal p-6">
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
        <>
          {notifsNonLues > 0 && (
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="ghost" size="sm" icon={CheckCheck} onClick={toutMarquerLu}>
                {t('monEspace.rappels.toutLu')}
              </Button>
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {notifications.slice(0, 8).map((n) => {
              const Icone = NOTIF_ICONE[n.type] ?? Bell
              const ton = NOTIF_TON[n.type] ?? '--brass'
              return (
                <li
                  key={n.id}
                  className={cn('flex gap-3 rounded-xl border bg-surface-2/40 p-3.5', n.lu ? 'border-hairline' : 'border-brass/30')}
                >
                  {/* Pastille d'icône teintée par TYPE (versement/retard/rappel) — repère visuel rapide. */}
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      color: `var(${ton})`,
                      backgroundColor: `color-mix(in oklch, var(${ton}) 14%, transparent)`,
                    }}
                  >
                    <Icone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.lu && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brass" aria-label={t('monEspace.rappels.nonLu')} />
                      )}
                      <p className="text-sm font-medium text-foreground">{n.titre}</p>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-faint">{formatDate(n.dateCreation, { dateStyle: 'long' })}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {!n.lu && (
                      <button
                        type="button"
                        onClick={() => marquerNotifLue(n.id)}
                        aria-label={t('monEspace.rappels.marquerLu')}
                        className="tap-target flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-jade"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => supprimerNotif(n.id)}
                      aria-label={t('monEspace.rappels.supprimer')}
                      className="tap-target flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-terra"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {notifications.length > 8 && (
            <p className="mt-2 text-center text-xs text-faint">
              {t('monEspace.rappels.autres', { count: notifications.length - 8 })}
            </p>
          )}
        </>
      )}
    </Card>
  )

  const blocReunions = (
    <Card className="nk-reveal nk-d4 p-6">
      <Overline>{t('monEspace.reunions.titre')}</Overline>
      {reunions.length === 0 ? (
        <p className="mt-4 text-sm text-faint">{t('monEspace.reunions.aucune')}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {reunions.map((r) => (
            <li key={r.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3.5">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{formatDate(r.date, { dateStyle: 'long' })}</p>
                  <p className="mt-0.5 text-xs text-faint">{t('monEspace.reunions.lieu')} : {r.lieu}</p>
                </div>
                <TypeReunionBadge type={r.type as TypeReunion} size="sm" />
              </div>
              {/* RSVP : le membre annonce sa présence. Pastilles colorées par ton de statut. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                <span className="text-xs text-faint">{t('monEspace.reunions.rsvpQuestion')}</span>
                <div className="flex gap-1.5" role="group" aria-label={t('monEspace.reunions.rsvpQuestion')}>
                  {RSVP_OPTIONS.map((s) => {
                    const actif = r.monStatut === s
                    const ton = RSVP_TON[s]
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={rsvpEnCours === r.id}
                        aria-pressed={actif}
                        onClick={() => void repondreRsvp(r.id, s)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                          !actif && 'border-hairline text-faint hover:text-foreground',
                        )}
                        style={
                          actif
                            ? {
                                color: `var(${ton})`,
                                borderColor: `color-mix(in oklch, var(${ton}) 45%, transparent)`,
                                backgroundColor: `color-mix(in oklch, var(${ton}) 15%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {t(cleI18n(`monEspace.reunions.rsvp.${s}`))}
                      </button>
                    )
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  const blocVotes = resolutions.length > 0 && (
    <Card className="nk-reveal nk-d4 p-6">
      <div className="flex items-center gap-2">
        <Vote className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('monEspace.votes.titre')}</Overline>
      </div>
      <ul className="mt-4 space-y-2">
        {resolutions.map((r) => (
          <li key={r.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3.5">
            <p className="text-sm text-foreground">{r.texte}</p>
            <p className="mt-0.5 text-xs text-faint">
              {t('monEspace.votes.reunion')} : {formatDate(r.reunionDate, { dateStyle: 'long' })} · {r.reunionLieu}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              <span className="text-xs text-faint">{t('monEspace.votes.question')}</span>
              <div className="flex gap-1.5" role="group" aria-label={t('monEspace.votes.question')}>
                {VOTE_OPTIONS.map((s) => {
                  const actif = r.monVote === s
                  const ton = VOTE_TON[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={voteEnCours === r.id}
                      aria-pressed={actif}
                      onClick={() => void voter(r.id, s)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                        !actif && 'border-hairline text-faint hover:text-foreground',
                      )}
                      style={
                        actif
                          ? {
                              color: `var(${ton})`,
                              borderColor: `color-mix(in oklch, var(${ton}) 45%, transparent)`,
                              backgroundColor: `color-mix(in oklch, var(${ton}) 15%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      {t(cleI18n(`monEspace.votes.sens.${s}`))}
                    </button>
                  )
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )

  const blocAmendes = amendes.length > 0 && (
    <Card className="nk-reveal p-6">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('monEspace.amendes.titre')}</Overline>
      </div>
      <ul className="mt-4 space-y-2">
        {amendes.map((a) => (
          <li key={a.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{a.motif}</p>
              <Badge tone={a.statut === 'PAYEE' ? 'jade' : a.statut === 'IMPAYEE' ? 'terra' : 'neutral'} size="sm">
                {t(cleI18n(`amendes.statuts.${a.statut}`))}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              {t(cleI18n(`amendes.types.${a.type}`))} · {formatDate(a.dateAmende, { dateStyle: 'long' })}
              {a.datePaiement ? ` · ${t('monEspace.amendes.payeeLe', { date: formatDate(a.datePaiement) })}` : ''}
            </p>
            <p className="mt-1">
              <Montant value={a.montant} className="font-medium" />
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )

  const blocCagnottes = cagnottes.length > 0 && (
    <Card className="nk-reveal p-6">
      <div className="flex items-center gap-2">
        <HandHeart className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('monEspace.cagnottes.titre')}</Overline>
      </div>
      <ul className="mt-4 space-y-2">
        {cagnottes.map((c) => (
          <li key={c.id} className="rounded-xl border border-hairline bg-surface-2/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{c.titre}</p>
              <Badge tone="neutral" size="sm">{t(cleI18n(`cagnottes.types.${c.type}`))}</Badge>
            </div>
            <p className="mt-1 text-xs text-faint">
              {t('monEspace.cagnottes.collecte')} : <span className="num">{formatMontant(c.collecteTotal)}</span>
              {c.objectif ? ` / ${formatMontant(c.objectif)}` : ''}
              {c.dateEvenement ? ` · ${formatDate(c.dateEvenement, { dateStyle: 'long' })}` : ''}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('monEspace.cagnottes.monDon')} :{' '}
              {c.monDon > 0 ? (
                <span className="text-jade">{formatMontant(c.monDon)}</span>
              ) : (
                <span className="text-faint">{t('monEspace.cagnottes.aucunDon')}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )

  const blocContributions = (
    <Card className="nk-reveal nk-d3 p-6">
      <Overline>{t('monEspace.contributions.titre')}</Overline>
      {contributions.length === 0 ? (
        <p className="mt-4 text-sm text-faint">{t('monEspace.contributions.aucune')}</p>
      ) : (
        <div className="mt-4">
          <DataTable
            columns={colContributions}
            rows={contributions}
            rowKey={(c) => c.id}
            // Dépliage : les versements qui composent l'année (données déjà renvoyées par
            // /moi/contributions). `null` si aucun → pas de chevron sur une année à 0 versement.
            expandable={(c) =>
              c.versements.length === 0 ? null : (
                <div>
                  <p className="mb-2 text-2xs font-medium uppercase tracking-[0.1em] text-faint">
                    {t('monEspace.contributions.detailVersements')}
                  </p>
                  <ul className="space-y-1.5">
                    {c.versements.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground">{formatDate(v.dateVersement)}</span>
                        {/* Libellé de mode via la source unique `commun.modesVersement`
                            (cf. lib/modes-versement.ts backend + garde de parité). */}
                        <span className="text-xs text-faint">{t(cleI18n(`commun.modesVersement.${v.mode}`))}</span>
                        <span className="num ml-auto text-foreground">{formatMontant(v.montant)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          />
        </div>
      )}
    </Card>
  )

  const blocTontines = tontines.length > 0 && (
    <Card className="nk-reveal p-6">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('monEspace.tontines.titre')}</Overline>
      </div>
      <ul className="mt-4 space-y-3">
        {tontines.map((tn, i) => (
          <li key={`${tn.tontineNom}-${tn.cycleNumero}-${i}`} className="rounded-xl border border-hairline bg-surface-2/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{tn.tontineNom}</p>
              <Badge tone="neutral" size="sm">{t('monEspace.tontines.cycle', { numero: tn.cycleNumero })}</Badge>
            </div>
            <p className="mt-1 text-xs text-faint">
              {t('monEspace.tontines.monRang')} : <span className="num">{tn.monOrdre}</span> ·{' '}
              {t('monEspace.tontines.maMise')} : <span className="num">{formatMontant(tn.miseDue)}</span> ·{' '}
              {t(cleI18n(`tontines.modes.${tn.modeRotation}`))}
            </p>
            <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
              {tn.tours.map((tr) => (
                <li key={tr.numero} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('monEspace.tontines.tour', { numero: tr.numero })}</span>
                  {tr.jeSuisBeneficiaire && (
                    <Badge tone="brass" size="sm">
                      <Trophy className="h-3 w-3" aria-hidden="true" />
                      {t('monEspace.tontines.beneficiaire')}
                    </Badge>
                  )}
                  {tr.maMisePayee ? (
                    <Badge tone="jade" size="sm">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {t('monEspace.tontines.misePayee')}
                    </Badge>
                  ) : tr.monMontantMise > 0 ? (
                    <Badge tone="amber" size="sm">
                      {t('monEspace.tontines.misePartielle', { montant: formatMontant(tr.monMontantMise) })}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">{t('monEspace.tontines.miseDue')}</Badge>
                  )}
                  <span className="ml-auto text-xs text-faint">
                    {t(cleI18n(`tontines.statutsTour.${tr.statut}`))}
                    {tr.montantPot !== null ? ` · ${t('monEspace.tontines.pot')} ${formatMontant(tr.montantPot)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  )

  const blocRecus = (
    <Card className="nk-reveal nk-d5 p-6">
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
                  <DataTable columns={colRecus} rows={recusAnnules} rowKey={(r) => r.id} rowClassName={() => 'text-muted-foreground'} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )

  // Rail droit rendu SEULEMENT s'il a du contenu (sinon une colonne vide en desktop) ; la colonne
  // principale reprend alors toute la largeur.
  const aRail = Boolean(blocCarte) || Boolean(blocNotifications)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('monEspace.titre')} description={t('monEspace.sousTitre')} />

      {/* Onglets unifiés (§3b) : segmentation de la page. Scrollable en mobile si les libellés débordent. */}
      <div className="mt-6 -mx-1 overflow-x-auto px-1">
        <Tabs
          value={tabActif}
          onValueChange={setTab}
          options={tabsOptions}
          idBase={TABS_ID}
          ariaLabel={t('monEspace.tabs.aria')}
        />
      </div>

      {/* Panneau unique réutilisé : son id/labelledby suivent l'onglet actif (paire APG fermée). */}
      <div
        role="tabpanel"
        id={panelId(TABS_ID, tabActif)}
        aria-labelledby={tabId(TABS_ID, tabActif)}
        tabIndex={0}
        className="mt-4 space-y-4 focus-visible:outline-none"
      >
        {tabActif === 'apercu' && (
          // Desktop : colonne principale (2/3) + rail droit (1/3). Le rail porte le SECONDAIRE
          // (carte de référence, notifications passives) ; la colonne garde le primaire et
          // l'actionnable (situation + CTA, réunions/RSVP, votes, obligations). `items-start` évite
          // que les colonnes s'étirent à la même hauteur. En mobile : une seule colonne (grille à
          // 1 colonne par défaut), l'ordre DOM plaçant la situation puis les actions en tête.
          <div className={cn('grid gap-4 lg:items-start', aRail ? 'lg:grid-cols-3' : 'lg:grid-cols-1')}>
            <div className={cn('space-y-4', aRail && 'lg:col-span-2')}>
              {blocSituation}
              {blocReunions}
              {blocVotes}
              {blocAmendes}
              {blocCagnottes}
            </div>
            {aRail && (
              <div className="space-y-4">
                {blocCarte}
                {blocNotifications}
              </div>
            )}
          </div>
        )}
        {tabActif === 'contributions' && blocContributions}
        {tabActif === 'tontines' && blocTontines}
        {tabActif === 'recus' && blocRecus}
      </div>

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
              <Montant value={Math.max(0, paiementCible.montantAttendu - paiementCible.montantValorise)} className="font-medium" />
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

      {/* Aperçu d'un reçu — DÉTAIL rendu en HTML natif (pas d'iframe PDF : bien plus fiable sur
          mobile). Le PDF officiel reste accessible via « Ouvrir le PDF » / « Télécharger ». */}
      <Modal
        open={recuApercu !== null}
        onClose={fermerApercuRecu}
        title={recuApercu ? t('monEspace.recus.apercuTitre', { numero: recuApercu.numero }) : ''}
        className="max-w-lg"
      >
        {recuApercu && (
          <div className="space-y-4">
            {recuDetail ? (
              <div className="overflow-hidden rounded-2xl border border-hairline">
                {/* Bandeau reçu (dégradé émeraude→or, même identité que la carte de membre). */}
                <div className="px-5 py-3" style={{ background: 'linear-gradient(100deg, #2f9e73, #e0bd6f)' }}>
                  <p className="truncate text-sm font-semibold text-[#04210f]">{recuDetail.orgNom}</p>
                  <p className="text-xs font-medium text-[#04210f]/80">{t('monEspace.recus.titre')}</p>
                </div>
                <dl className="divide-y divide-hairline px-5 text-sm">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-faint">{t('monEspace.recus.numero')}</dt>
                    <dd className="num text-foreground">{recuDetail.numero}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-faint">{t('monEspace.recus.membre')}</dt>
                    <dd className="text-foreground">{recuDetail.membreNom} {recuDetail.membrePrenom}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-faint">{t('monEspace.recus.dateVersement')}</dt>
                    <dd className="text-foreground">{formatDate(recuDetail.dateVersement, { dateStyle: 'long' })}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-faint">{t('monEspace.contributions.annee')}</dt>
                    <dd className="num text-foreground">{recuDetail.annee}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-faint">{t('monEspace.recus.mode')}</dt>
                    <dd className="text-foreground">{t(cleI18n(`commun.modesVersement.${recuDetail.mode}`))}</dd>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-faint">{t('monEspace.recus.montant')}</dt>
                    <dd><Montant value={recuDetail.montant} className="text-base font-semibold" /></dd>
                  </div>
                  {recuDetail.annuleLe && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-faint">{t('monEspace.recus.statut')}</dt>
                      <dd><Badge tone="terra" size="sm"><Ban className="h-3 w-3" aria-hidden="true" />{t('monEspace.recus.annule')}</Badge></dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <Skeleton className="h-64 w-full" />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" icon={ExternalLink} onClick={() => ouvrirPdfRecu(recuApercu.id)}>
                {t('monEspace.recus.ouvrirPdf')}
              </Button>
              <Button type="button" icon={Download} onClick={() => telechargerRecu(recuApercu)}>
                {t('monEspace.recus.telecharger')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default MonEspacePage
