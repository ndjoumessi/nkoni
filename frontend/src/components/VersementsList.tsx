import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2, Download, Send, Pencil, Trash2, Ban } from 'lucide-react'
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
  membreTelephone,
  membrePrenom,
  onChange,
}: {
  contributionId: string
  membreId: string
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [annulantRecu, setAnnulantRecu] = useState<string | null>(null)
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
        for (const r of rs) {
          const courant = parVersement.get(r.versementId)
          if (!courant || (courant.annuleLe !== null && r.annuleLe === null)) {
            parVersement.set(r.versementId, r)
          }
        }
        setRecus(parVersement)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof ApiError ? e.message : t('versements.liste.erreurChargement'))
      } finally {
        setLoading(false)
      }
    },
    [accessToken, contributionId, membreId, t],
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
      setRecus((prev) => new Map(prev).set(recu.versementId, { ...recu, annuleLe: maj.annuleLe }))
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
            <div className="flex flex-wrap items-center gap-2">
              {recu && recu.annuleLe === null ? (
                <>
                  <Badge tone="jade" size="sm">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('versements.liste.recu', { numero: recu.numero })}
                  </Badge>
                  <Button variant="ghost" size="sm" icon={Download} onClick={() => telecharger(recu.id)}>
                    {t('versements.liste.telecharger')}
                  </Button>
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
              {peutGerer && (
                <>
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
                </>
              )}
            </div>
          </div>
        )
      })}

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
