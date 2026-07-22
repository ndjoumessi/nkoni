import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2, Download, Send, Mail, Pencil, Trash2, Ban, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  versementsApi,
  recusApi,
  ApiError,
  type Versement,
  type Recu,
  type ModeVersement,
} from '@/lib/api'
import { peutSaisirVersement } from '@/lib/roles'
import { formatMontant } from '@/lib/format'
import { formatDate, telephoneWaMe } from '@/lib/utils'
import { cleI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'

/** Format numérique court (jj/mm/aaaa) selon la langue courante. */
const DATE_COURTE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const

const MODES: ModeVersement[] = ['ESPECES', 'TIERS', 'AUTRE']

/** ISO (…T…Z) → `yyyy-mm-dd` attendu par le DatePicker. */
const versISODate = (iso: string): string => iso.slice(0, 10)

/**
 * Liste des versements d'une contribution avec, pour chacun, le numéro de reçu s'il
 * existe déjà, sinon un bouton « Générer le reçu » (§4.6, jamais automatique).
 * Les reçus existants sont récupérés en une fois via GET /recus?membreId= (pas de N+1).
 *
 * Gestion (ADMIN/TRÉSORIÈRE) : chaque versement peut être MODIFIÉ (modale) ou SUPPRIMÉ
 * (confirmation). Le back reporte le delta / décrémente les totaux ; `onChange` prévient
 * le parent (fiche membre) pour rafraîchir les montants cumulés affichés au-dessus.
 */
export function VersementsList({
  contributionId,
  membreId,
  annee,
  membreTelephone,
  membrePrenom,
  onChange,
}: {
  contributionId: string
  membreId: string
  /**
   * Année de la contribution affichée. Sert à ranger les reçus ORPHELINS sous le bon accordéon :
   * `listByMembre` renvoie tous les reçus du membre, alors que ce composant est monté une fois
   * par année. Sans ce filtre, un orphelin apparaîtrait partout.
   */
  annee: number
  /** Téléphone du membre — pré-remplit le destinataire du lien `wa.me` de partage du reçu. */
  membreTelephone?: string | null
  /** Prénom du membre — personnalise la salutation du message WhatsApp (« Bonjour Romel, … »). */
  membrePrenom?: string | null
  onChange?: () => void
}) {
  const { t } = useTranslation()
  const { accessToken, user } = useAuth()
  const toast = useToast()
  const [versements, setVersements] = useState<Versement[]>([])
  const [recus, setRecus] = useState<Map<string, Recu>>(new Map())
  /** Reçus dont le versement a été supprimé — affichés en trace, sans aucune action possible. */
  const [orphelins, setOrphelins] = useState<Recu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [annulantRecu, setAnnulantRecu] = useState<string | null>(null)
  const [envoyantRecu, setEnvoyantRecu] = useState<string | null>(null)
  const [recuAAnnuler, setRecuAAnnuler] = useState<Recu | null>(null)
  const peutGerer = peutSaisirVersement(user?.role)

  // Édition (modale) — versement en cours + champs contrôlés.
  const [editing, setEditing] = useState<Versement | null>(null)
  const [editMontant, setEditMontant] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editMode, setEditMode] = useState<ModeVersement>('ESPECES')
  const [editNote, setEditNote] = useState('')
  const [editErr, setEditErr] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  // Suppression (confirmation).
  const [confirmDelete, setConfirmDelete] = useState<Versement | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Trace d'audit (reçus annulés dont le versement a été supprimé) repliée par défaut — elle ne
  // doit pas dominer le registre vivant des versements réels.
  const [orphelinsOuverts, setOrphelinsOuverts] = useState(false)

  const charger = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) return
      setLoading(true)
      setError(null)
      try {
        const [vs, rs] = await Promise.all([
          versementsApi.listByContribution(contributionId, accessToken, signal),
          recusApi.listByMembre(membreId, accessToken, signal),
        ])
        setVersements(vs)
        // Un versement peut porter PLUSIEURS reçus après une annulation suivie d'une réémission
        // (chaque émission consomme un numéro). On retient le reçu ACTIF s'il existe, sinon le
        // dernier annulé — pour afficher l'état courant, pas un document périmé.
        const parVersement = new Map<string, Recu>()
        const sansVersement: Recu[] = []
        for (const r of rs) {
          // Reçu ORPHELIN : son versement a été supprimé. Il n'a aucune ligne à laquelle
          // s'accrocher — on le rend à part, en trace lecture seule.
          //
          // Filtré sur l'ANNÉE : ce composant est monté une fois par contribution (donc par
          // année), alors que `listByMembre` renvoie TOUS les reçus du membre. Sans ce filtre,
          // chaque orphelin apparaîtrait dans TOUS les accordéons annuels.
          if (r.versementId === null) {
            if (r.annee === annee) sansVersement.push(r)
            continue
          }
          const courant = parVersement.get(r.versementId)
          if (!courant || (courant.annuleLe !== null && r.annuleLe === null)) {
            parVersement.set(r.versementId, r)
          }
        }
        setRecus(parVersement)
        setOrphelins(sansVersement)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof ApiError ? e.message : t('versements.liste.erreurChargement'))
      } finally {
        setLoading(false)
      }
    },
    [accessToken, contributionId, membreId, annee, t],
  )

  useEffect(() => {
    const controller = new AbortController()
    void charger(controller.signal)
    return () => controller.abort()
  }, [charger])

  const genererRecu = async (versementId: string) => {
    if (!accessToken) return
    setGenerating(versementId)
    try {
      const recu = await recusApi.generer(versementId, accessToken)
      setRecus((prev) => new Map(prev).set(versementId, recu))
      toast.success(t('versements.toast.recuGenere'), t('versements.toast.recuNumero', { numero: recu.numero }))
    } catch (e) {
      toast.error(
        t('versements.toast.generationImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.generationEchec'),
      )
    } finally {
      setGenerating(null)
    }
  }

  /**
   * Annule le reçu (annulation COMPTABLE : numéro et trace conservés). C'est ce qui libère la
   * modification et la suppression du versement, refusées tant qu'un reçu ACTIF existe.
   */
  const annulerLeRecu = async (recu: Recu) => {
    if (!accessToken) return
    setAnnulantRecu(recu.id)
    try {
      const maj = await recusApi.annuler(recu.id, accessToken)
      // `versementId` non nul par construction : seul un reçu ACTIF est annulable, et un reçu
      // actif a TOUJOURS un versement (l'orphelinage suppose l'annulation préalable). La garde
      // rend l'invariant lisible plutôt que de l'écraser d'un `!`.
      const vId = recu.versementId
      if (vId) setRecus((prev) => new Map(prev).set(vId, { ...recu, annuleLe: maj.annuleLe }))
      setRecuAAnnuler(null)
      toast.success(
        t('versements.toast.recuAnnule'),
        t('versements.toast.recuAnnuleDetail', { numero: recu.numero }),
      )
    } catch (e) {
      toast.error(
        t('versements.toast.annulationImpossible'),
        e instanceof ApiError ? e.message : '',
      )
    } finally {
      setAnnulantRecu(null)
    }
  }

  const telecharger = async (recuId: string) => {
    if (!accessToken) return
    try {
      const blob = await recusApi.telecharger(recuId, accessToken)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(t('versements.toast.telechargementImpossible'), e instanceof ApiError ? e.message : '')
    }
  }

  // Partage du reçu via WhatsApp « click-to-chat » (wa.me) : ouvre WhatsApp de l'utilisateur avec
  // un message pré-rempli (récap + LIEN PUBLIC signé de téléchargement). Aucun envoi automatique,
  // aucune config Meta requise — le membre télécharge son reçu depuis le lien, sans compte.
  const partagerWhatsApp = (recu: Recu, montant: number) => {
    const numero = telephoneWaMe(membreTelephone)
    // Salutation personnalisée si le prénom est connu, sinon générique.
    const prenom = membrePrenom?.trim()
    const salutation = prenom
      ? t('versements.partage.salutationNom', { prenom })
      : t('versements.partage.salutation')
    // Nom d'organisation en tête (gras WhatsApp `*…*`) ; repli « NKONI » si absent.
    const message = t('versements.partage.message', {
      organisation: user?.nomOrganisation?.trim() || 'NKONI',
      salutation,
      numero: recu.numero,
      montant: formatMontant(montant),
      lien: recusApi.urlPartage(recu),
    })
    const base = numero ? `https://wa.me/${numero}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
  }

  // Envoi SERVEUR du reçu au membre : WhatsApp d'abord, EMAIL en repli (§4.6, GA 0.4). Distinct du
  // partage `wa.me` ci-dessus (qui ouvre le WhatsApp de l'utilisateur) : ici c'est le serveur qui
  // délivre, automatiquement, dès qu'un canal est configuré. Best-effort — on informe du canal.
  const envoyerRecu = async (recu: Recu) => {
    if (!accessToken) return
    setEnvoyantRecu(recu.id)
    try {
      const r = await recusApi.envoyer(recu.id, accessToken)
      if (r.envoye && r.canal === 'whatsapp') {
        toast.success(t('versements.toast.recuEnvoye'), t('versements.toast.recuEnvoyeWhatsApp'))
      } else if (r.envoye && r.canal === 'email') {
        toast.success(t('versements.toast.recuEnvoye'), t('versements.toast.recuEnvoyeEmail'))
      } else {
        toast.info(t('versements.toast.recuNonEnvoye'), t('versements.toast.recuNonEnvoyeDetail'))
      }
    } catch (e) {
      toast.error(t('versements.toast.recuEnvoiImpossible'), e instanceof ApiError ? e.message : '')
    } finally {
      setEnvoyantRecu(null)
    }
  }

  const ouvrirEdition = (v: Versement) => {
    setEditing(v)
    setEditMontant(String(v.montant))
    setEditDate(versISODate(v.dateVersement))
    setEditMode(v.mode)
    setEditNote(v.note ?? '')
    setEditErr(undefined)
  }

  const enregistrerEdition = async () => {
    if (!accessToken || !editing) return
    const m = Number(editMontant)
    if (editMontant.trim().length === 0) {
      setEditErr(t('versements.edition.montantRequis'))
      return
    }
    if (Number.isNaN(m) || m <= 0) {
      setEditErr(t('versements.edition.montantPositif'))
      return
    }
    setSaving(true)
    try {
      await versementsApi.modifier(
        editing.id,
        {
          montant: m,
          dateVersement: editDate,
          mode: editMode,
          note: editNote.trim() ? editNote.trim() : null,
        },
        accessToken,
      )
      setEditing(null)
      toast.success(t('versements.toast.versementModifie'))
      await charger()
      onChange?.()
    } catch (e) {
      toast.error(
        t('versements.toast.modificationImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.modificationEchec'),
      )
    } finally {
      setSaving(false)
    }
  }

  const supprimer = async () => {
    if (!accessToken || !confirmDelete) return
    setDeleting(true)
    try {
      await versementsApi.supprimer(confirmDelete.id, accessToken)
      setConfirmDelete(null)
      toast.success(t('versements.toast.versementSupprime'))
      await charger()
      onChange?.()
    } catch (e) {
      toast.error(
        t('versements.toast.suppressionImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.suppressionEchec'),
      )
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />
        {t('versements.liste.chargement')}
      </div>
    )
  }

  if (error) {
    return <p className="px-4 py-3 text-sm text-terra">{error}</p>
  }

  if (versements.length === 0) {
    return <p className="px-4 py-3 text-sm text-faint">{t('versements.liste.aucun')}</p>
  }

  return (
    <div className="space-y-2 px-3 py-3">
      {versements.map((v) => {
        const recu = recus.get(v.id)

        /*
          MIROIR des gardes serveur (§4.6) — SYMÉTRIQUES : seul un reçu ACTIF bloque, aussi bien la
          modification que la suppression. L'annuler débloque les deux.

          (Historique : la suppression a un temps été bloquée par TOUT reçu, la FK étant en
          `Restrict` inconditionnel. Elle est passée en `SetNull` — supprimer le versement laisse
          désormais un reçu ORPHELIN, conservé et affiché en trace plus bas.)

          On MASQUE modifier/supprimer plutôt que de les afficher désactivés : un bouton grisé est
          illisible et sans infobulle au tactile (anti-pattern proscrit, cf. CLAUDE.md), et
          n'explique jamais le « pourquoi ». Le chemin de correction reste sur la MÊME ligne
          (« Annuler le reçu » ci-dessus) : l'annulation rétablit aussitôt les deux actions. La garde
          serveur (409) demeure le vrai garde-fou ; masquer ici évite juste d'inviter à un geste
          voué à l'échec.
        */
        const recuActif = recu && recu.annuleLe === null ? recu : null

        return (
          <div
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="num text-sm font-medium text-foreground">
                {formatMontant(v.montant)}
                <span className="ml-2 text-xs font-normal text-faint">
                  {formatDate(v.dateVersement, DATE_COURTE)} · {t(`versements.modes.${v.mode}`)}
                </span>
              </p>
              {v.note && <p className="mt-0.5 truncate text-xs text-faint">{v.note}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
              {recu && recu.annuleLe === null ? (
                <>
                  <Badge tone="jade" size="sm">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('versements.liste.recu', { numero: recu.numero })}
                  </Badge>
                  {/*
                    ICÔNE SEULE — mesuré : la rangée d'un reçu actif porte 6 éléments pour 686 px
                    dans 658 px disponibles, elle débordait donc systématiquement. Le libellé
                    « Télécharger » (120 px) est celui qu'on retire : la flèche descendante est
                    l'icône la moins ambiguë du lot, et Modifier/Supprimer sont déjà en icône seule
                    juste à côté. « WhatsApp » et « Annuler le reçu » GARDENT leur libellé — le
                    premier nomme un canal (une icône d'envoi ne le dirait pas), le second est
                    l'action conséquente de la rangée.
                  */}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Download}
                    aria-label={t('versements.liste.telecharger')}
                    title={t('versements.liste.telecharger')}
                    onClick={() => telecharger(recu.id)}
                  />
                  {peutGerer && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Send}
                        onClick={() => partagerWhatsApp(recu, v.montant)}
                      >
                        {t('versements.liste.whatsapp')}
                      </Button>
                      {/* Envoi SERVEUR (WhatsApp → repli email) — distinct du partage wa.me ci-dessus :
                          ici le serveur délivre automatiquement dès qu'un canal est configuré. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Mail}
                        loading={envoyantRecu === recu.id}
                        onClick={() => envoyerRecu(recu)}
                      >
                        {t('versements.liste.envoyer')}
                      </Button>
                      {/* Seule porte de sortie quand ce versement doit être corrigé : tant qu'un reçu
                          ACTIF existe, sa modification et sa suppression sont refusées. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Ban}
                        loading={annulantRecu === recu.id}
                        onClick={() => setRecuAAnnuler(recu)}
                      >
                        {t('versements.liste.annulerRecu')}
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Reçu ANNULÉ : la trace reste visible (numéro conservé), mais il n'est plus
                      téléchargeable ni partageable — et un reçu corrigé peut être réémis. */}
                  {recu && (
                    <Badge tone="neutral" size="sm">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('versements.liste.recuAnnule', { numero: recu.numero })}
                    </Badge>
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  icon={FileText}
                  loading={generating === v.id}
                  onClick={() => genererRecu(v.id)}
                >
                  {t('versements.liste.generer')}
                </Button>
                </>
              )}
              {peutGerer && !recuActif && (
                /*
                  Actions portant sur le VERSEMENT (et non sur le reçu) — séparées par un filet.
                  Entièrement MASQUÉES tant qu'un reçu actif verrouille la ligne (cf. `recuActif`
                  plus haut) : ni bouton fantôme désactivé, ni corbeille orpheline sous le
                  séparateur. Les deux boutons sont donc toujours cliquables ici.
                */
                <div className="flex shrink-0 items-center gap-1 border-l border-hairline pl-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    aria-label={t('versements.liste.modifier')}
                    title={t('versements.liste.modifier')}
                    onClick={() => ouvrirEdition(v)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label={t('versements.liste.supprimer')}
                    title={t('versements.liste.supprimer')}
                    className="hover:bg-terra/10 hover:text-terra"
                    onClick={() => setConfirmDelete(v)}
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/*
        REÇUS ORPHELINS — leur versement a été supprimé (ce qui suppose que le reçu était déjà
        annulé). La ligne survit pour deux raisons : son numéro serait sinon réutilisé par la
        génération suivante, et un membre à qui ce reçu a été remis doit pouvoir en retrouver la
        trace. Tout est lu sur le SNAPSHOT figé à l'émission, pas sur un versement qui n'existe
        plus.

        SÉPARÉS du registre vivant : regroupés sous un dépliant REPLIÉ par défaut, APRÈS les
        versements réels. Sur un membre ayant connu des corrections, ces traces noieraient sinon
        les versements réels sous un poids visuel égal. Le montant y est ATTÉNUÉ (barré, sans la
        police `.num` des montants réels) : c'est de l'argent NON collecté, il ne doit pas se lire
        comme un encaissement.

        Lecture seule et SANS garde de rôle : c'est une trace, pas une action. Aucun bouton —
        télécharger et partager sont refusés (409) sur un reçu annulé, et il n'y a plus rien à
        modifier ni à supprimer.
      */}
      {orphelins.length > 0 && (
        <div className="mt-1 border-t border-hairline pt-2">
          <button
            type="button"
            onClick={() => setOrphelinsOuverts((o) => !o)}
            aria-expanded={orphelinsOuverts}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-xs font-medium text-faint transition-colors hover:text-muted-foreground"
          >
            {orphelinsOuverts ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t('versements.liste.recusAnnulesGroupe', { count: orphelins.length })}
          </button>
          {orphelinsOuverts && (
            <div className="mt-2 space-y-2">
              {orphelins.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-hairline bg-surface/30 px-4 py-3 opacity-75"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-faint">
                      {/* Montant BARRÉ et sans `.num` : argent non collecté, jamais lu comme un encaissement. */}
                      <span className="line-through">{formatMontant(r.montant)}</span>
                      <span className="ml-2 text-xs">
                        {formatDate(r.dateVersement, DATE_COURTE)} · {t(cleI18n(`versements.modes.${r.mode}`))}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-faint">{t('versements.liste.versementSupprime')}</p>
                  </div>
                  <Badge tone="neutral" size="sm">
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('versements.liste.recuAnnule', { numero: r.numero })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modale d'édition */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('versements.edition.titre')}>
        <div className="space-y-4">
          <Field label={t('versements.edition.montant')} required error={editErr}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={editMontant}
              onChange={(e) => {
                setEditMontant(e.target.value)
                setEditErr(undefined)
              }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('versements.edition.date')} required>
              <DatePicker value={editDate} onChange={setEditDate} />
            </Field>
            <Field label={t('versements.edition.mode')} required>
              <Select value={editMode} onChange={(e) => setEditMode(e.target.value as ModeVersement)}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`versements.modes.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('versements.edition.note')}>
            <Textarea rows={2} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(null)}>
            {t('versements.edition.annuler')}
          </Button>
          <Button loading={saving} onClick={enregistrerEdition}>
            {t('versements.edition.enregistrer')}
          </Button>
        </div>
      </Modal>

      {/* Confirmation de suppression */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t('versements.suppression.titre')}
      >
        <p className="text-sm text-muted-foreground">
          {t('versements.suppression.confirmation', {
            montant: confirmDelete ? formatMontant(confirmDelete.montant) : '',
          })}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            {t('versements.suppression.annuler')}
          </Button>
          <Button variant="danger" icon={Trash2} loading={deleting} onClick={supprimer}>
            {t('versements.suppression.confirmer')}
          </Button>
        </div>
      </Modal>

      {/* Confirmation d'ANNULATION du reçu — irréversible : le numéro reste consommé, un reçu
          corrigé devra être réémis sous un nouveau numéro. */}
      <Modal
        open={recuAAnnuler !== null}
        onClose={() => setRecuAAnnuler(null)}
        title={t('versements.annulationRecu.titre')}
      >
        <p className="text-sm text-muted-foreground">
          {t('versements.annulationRecu.confirmation', { numero: recuAAnnuler?.numero ?? '' })}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRecuAAnnuler(null)}>
            {t('versements.annulationRecu.annuler')}
          </Button>
          <Button
            variant="danger"
            icon={Ban}
            loading={annulantRecu !== null}
            onClick={() => recuAAnnuler && annulerLeRecu(recuAAnnuler)}
          >
            {t('versements.annulationRecu.confirmer')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default VersementsList
