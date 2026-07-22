import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { Ban, Check, Gavel, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  amendesApi,
  membresApi,
  ApiError,
  messageErreur,
  type Amende,
  type AmendesReponse,
  type MembreStatut,
  type ModeVersement,
  type StatutAmende,
  type TypeAmende,
} from '@/lib/api'
import { peutVoirAmendes, peutGererAmende, peutEncaisserAmende } from '@/lib/roles'
import { formatMontant } from '@/lib/format'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Montant } from '@/components/ui/Montant'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { SelecteurMembreUnique } from '@/components/membres/SelecteurMembreUnique'
import { DatePicker } from '@/components/ui/DatePicker'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'

const TYPES: TypeAmende[] = ['RETARD_COTISATION', 'ABSENCE_REUNION', 'AUTRE']
const STATUTS: StatutAmende[] = ['IMPAYEE', 'PAYEE', 'ANNULEE']
const MODES: ModeVersement[] = ['ESPECES', 'TIERS', 'AUTRE']

const TONE_STATUT: Record<StatutAmende, string> = {
  IMPAYEE: 'border-brass/30 bg-brass/[0.08] text-brass',
  PAYEE: 'border-jade/30 bg-jade/[0.08] text-jade',
  ANNULEE: 'border-hairline bg-surface-2/60 text-faint',
}

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Amendes / pénalités (§4.10) — liste, filtres, saisie, encaissement, annulation. */
export function AmendesPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [data, setData] = useState<AmendesReponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [membres, setMembres] = useState<MembreStatut[]>([])

  const [fStatut, setFStatut] = useState<StatutAmende | ''>('')
  const [fMembre, setFMembre] = useState('')

  const [modal, setModal] = useState<'form' | 'payer' | null>(null)
  const [edit, setEdit] = useState<Amende | null>(null)
  const [aAnnuler, setAAnnuler] = useState<Amende | null>(null)
  const [aSupprimer, setASupprimer] = useState<Amende | null>(null)
  const [aPayer, setAPayer] = useState<Amende | null>(null)
  const [busy, setBusy] = useState(false)

  // Formulaire création/édition.
  const [fmMembre, setFmMembre] = useState('')
  const [fmType, setFmType] = useState<TypeAmende>('RETARD_COTISATION')
  const [fmMotif, setFmMotif] = useState('')
  const [fmMontant, setFmMontant] = useState('')
  const [fmDate, setFmDate] = useState(aujourdHui())
  // Encaissement.
  const [payDate, setPayDate] = useState(aujourdHui())
  const [payMode, setPayMode] = useState<ModeVersement>('ESPECES')

  const gestion = peutGererAmende(user?.role)
  const argent = peutEncaisserAmende(user?.role)

  const charger = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) return
      const filtre: { membreId?: string; statut?: StatutAmende } = {}
      if (fMembre) filtre.membreId = fMembre
      if (fStatut) filtre.statut = fStatut
      const res = await amendesApi.list(filtre, accessToken, signal)
      setData(res)
    },
    [accessToken, fMembre, fStatut],
  )

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [, liste] = await Promise.all([
          charger(controller.signal),
          membres.length === 0
            ? membresApi.listStatuts(accessToken, controller.signal).catch(() => [] as MembreStatut[])
            : Promise.resolve(membres),
        ])
        if (active && liste) setMembres(liste)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, fMembre, fStatut])

  if (!peutVoirAmendes(user?.role)) return <Navigate to="/dashboard" replace />

  const ouvrirCreation = () => {
    setEdit(null)
    setFmMembre('')
    setFmType('RETARD_COTISATION')
    setFmMotif('')
    setFmMontant('')
    setFmDate(aujourdHui())
    setModal('form')
  }
  const ouvrirEdition = (a: Amende) => {
    setEdit(a)
    setFmMembre(a.membreId)
    setFmType(a.type)
    setFmMotif(a.motif)
    setFmMontant(String(a.montant))
    setFmDate(a.dateAmende.slice(0, 10))
    setModal('form')
  }

  const soumettreForm = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    const montant = Math.round(Number(fmMontant))
    if (!edit && !fmMembre) return toast.error(t('amendes.form.validationMembre'))
    if (!fmMotif.trim()) return toast.error(t('amendes.form.validationMotif'))
    if (!montant || montant <= 0) return toast.error(t('amendes.form.validationMontant'))
    setBusy(true)
    try {
      if (edit) {
        await amendesApi.update(
          edit.id,
          { type: fmType, motif: fmMotif.trim(), montant, dateAmende: new Date(fmDate).toISOString() },
          accessToken,
        )
        toast.success(t('amendes.form.toast.miseAJour'))
      } else {
        await amendesApi.create(
          { membreId: fmMembre, type: fmType, motif: fmMotif.trim(), montant, dateAmende: new Date(fmDate).toISOString() },
          accessToken,
        )
        toast.success(t('amendes.form.toast.cree'))
      }
      await charger()
      setModal(null)
    } catch (err) {
      toast.error(t('amendes.form.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const encaisser = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !aPayer) return
    setBusy(true)
    try {
      await amendesApi.payer(
        aPayer.id,
        { datePaiement: new Date(payDate).toISOString(), modePaiement: payMode },
        accessToken,
      )
      await charger()
      toast.success(t('amendes.payer.toast.paye'))
      setModal(null)
      setAPayer(null)
    } catch (err) {
      toast.error(t('amendes.payer.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmerAnnuler = async () => {
    if (!accessToken || !aAnnuler) return
    setBusy(true)
    try {
      await amendesApi.annuler(aAnnuler.id, accessToken)
      await charger()
      toast.success(t('amendes.confirm.toast.annulee'))
      setAAnnuler(null)
    } catch (err) {
      toast.error(t('amendes.confirm.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmerSupprimer = async () => {
    if (!accessToken || !aSupprimer) return
    setBusy(true)
    try {
      await amendesApi.remove(aSupprimer.id, accessToken)
      await charger()
      toast.success(t('amendes.confirm.toast.supprimee'))
      setASupprimer(null)
    } catch (err) {
      toast.error(t('amendes.confirm.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const amendes = data?.amendes ?? []
  // État vide « vrai » (aucune amende ET aucun filtre) → l'EmptyState porte le CTA de création.
  // On masque alors le bouton d'en-tête pour éviter le doublon (pattern Commémorations/Cagnottes).
  const afficheEmpty = !loading && !error && amendes.length === 0 && !fMembre && !fStatut

  return (
    <>
      <PageHeader
        overline={t('amendes.overline')}
        title={t('amendes.titre')}
        description={t('amendes.sousTitre')}
        actions={
          gestion && !afficheEmpty ? (
            <Button icon={Plus} onClick={ouvrirCreation}>
              {t('amendes.nouvelle')}
            </Button>
          ) : undefined
        }
      />

      {data && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-2 gap-3">
          <StatCard label={t('amendes.totaux.du')} value={<Montant value={data.totaux.du} />} tone="brass" icon={Gavel} />
          <StatCard label={t('amendes.totaux.encaisse')} value={<Montant value={data.totaux.encaisse} />} tone="jade" icon={Check} />
        </div>
      )}

      <div className="nk-reveal nk-d3 mt-5 flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={fStatut} onChange={(e) => setFStatut(e.target.value as StatutAmende | '')} aria-label={t('amendes.filtres.statut')}>
            <option value="">{t('amendes.filtres.tousStatuts')}</option>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {t(`amendes.statuts.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-64">
          <SelecteurMembreUnique
            membres={membres}
            valeur={fMembre}
            onChange={setFMembre}
            placeholder={t('amendes.filtres.tousMembres')}
            optionTous={t('amendes.filtres.tousMembres')}
            ariaLabel={t('amendes.filtres.membre')}
          />
        </div>
        {(fStatut || fMembre) && (
          <button
            type="button"
            onClick={() => {
              setFStatut('')
              setFMembre('')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t('amendes.filtres.reinitialiser')}
          </button>
        )}
      </div>

      <div className="nk-reveal nk-d3 mt-5">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <ErrorState title={t('commun.erreurs.chargementImpossible')} description={error} />
        )}

        {!loading && !error && amendes.length === 0 && (fMembre || fStatut) && (
          <Card className="p-6 text-sm text-muted-foreground">{t('amendes.aucuneFiltre')}</Card>
        )}

        {!loading && !error && amendes.length === 0 && !fMembre && !fStatut && (
          <EmptyState
            icon={Gavel}
            title={t('amendes.empty.titre')}
            className="min-h-[40vh] justify-center"
            description={t('amendes.empty.description')}
            action={
              gestion && (
                <Button icon={Plus} onClick={ouvrirCreation}>
                  {t('amendes.empty.action')}
                </Button>
              )
            }
          />
        )}

        {!loading && !error && amendes.length > 0 && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">{t('amendes.colonnes.membre')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('amendes.colonnes.type')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('amendes.colonnes.motif')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('amendes.colonnes.date')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('amendes.colonnes.montant')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('amendes.colonnes.statut')}</th>
                  {(gestion || argent) && <th className="px-4 py-2.5 text-right font-medium">{t('amendes.colonnes.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {amendes.map((a) => (
                  <tr key={a.id} className="border-b border-hairline/60 last:border-0">
                    <td className="px-4 py-2.5 text-foreground">
                      {a.membre.prenom} {a.membre.nom}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t(`amendes.types.${a.type}`)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.motif}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(a.dateAmende)}</td>
                    <td className="num px-4 py-2.5 text-right font-medium text-foreground">{formatMontant(a.montant)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_STATUT[a.statut]}`}>
                        {t(`amendes.statuts.${a.statut}`)}
                      </span>
                    </td>
                    {(gestion || argent) && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {a.statut === 'IMPAYEE' && argent && (
                            <button type="button" onClick={() => { setAPayer(a); setPayDate(aujourdHui()); setPayMode('ESPECES'); setModal('payer') }} className="rounded-md p-1.5 text-faint transition-colors hover:bg-jade/10 hover:text-jade" aria-label={t('amendes.actions.payer')} title={t('amendes.actions.payer')}>
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {a.statut === 'IMPAYEE' && gestion && (
                            <button type="button" onClick={() => ouvrirEdition(a)} className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-foreground" aria-label={t('amendes.actions.modifier')} title={t('amendes.actions.modifier')}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {a.statut === 'IMPAYEE' && argent && (
                            <button type="button" onClick={() => setAAnnuler(a)} className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-foreground" aria-label={t('amendes.actions.annuler')} title={t('amendes.actions.annuler')}>
                              <Ban className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {a.statut === 'IMPAYEE' && gestion && (
                            <button type="button" onClick={() => setASupprimer(a)} className="rounded-md p-1.5 text-faint transition-colors hover:bg-terra/10 hover:text-terra" aria-label={t('amendes.actions.supprimer')} title={t('amendes.actions.supprimer')}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Modale création / édition */}
      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={edit ? t('amendes.form.titreEdition') : t('amendes.form.titreCreation')}>
        <form onSubmit={soumettreForm} className="space-y-4">
          {!edit && (
            <Field label={t('amendes.form.membre')} required>
              <SelecteurMembreUnique
                membres={membres}
                valeur={fmMembre}
                onChange={setFmMembre}
                placeholder={t('amendes.form.membrePlaceholder')}
                ariaLabel={t('amendes.form.membre')}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('amendes.form.type')}>
              <Select value={fmType} onChange={(e) => setFmType(e.target.value as TypeAmende)}>
                {TYPES.map((tv) => (
                  <option key={tv} value={tv}>
                    {t(`amendes.types.${tv}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('amendes.form.date')}>
              <DatePicker value={fmDate} onChange={setFmDate} />
            </Field>
          </div>
          <Field label={t('amendes.form.motif')} required>
            <Input value={fmMotif} onChange={(e) => setFmMotif(e.target.value)} placeholder={t('amendes.form.motifPlaceholder')} maxLength={500} />
          </Field>
          <Field label={t('amendes.form.montant')} required>
            <Input inputMode="numeric" value={fmMontant} onChange={(e) => setFmMontant(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>
              {t('amendes.form.annuler')}
            </Button>
            <Button type="submit" icon={Gavel} loading={busy}>
              {edit ? t('amendes.form.enregistrer') : t('amendes.form.creer')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale encaissement */}
      <Modal open={modal === 'payer'} onClose={() => { setModal(null); setAPayer(null) }} title={t('amendes.payer.titre')}>
        <form onSubmit={encaisser} className="space-y-4">
          {aPayer && <p className="text-sm text-muted-foreground">{t('amendes.payer.montantInfo', { montant: formatMontant(aPayer.montant) })}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('amendes.payer.date')}>
              <DatePicker value={payDate} onChange={setPayDate} />
            </Field>
            <Field label={t('amendes.payer.mode')}>
              <Select value={payMode} onChange={(e) => setPayMode(e.target.value as ModeVersement)}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`amendes.modes.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setModal(null); setAPayer(null) }}>
              {t('amendes.payer.annuler')}
            </Button>
            <Button type="submit" icon={Check} loading={busy}>
              {t('amendes.payer.confirmer')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation annulation */}
      <Modal open={aAnnuler !== null} onClose={() => setAAnnuler(null)} title={t('amendes.confirm.annulerTitre')}>
        <p className="text-sm text-muted-foreground">{t('amendes.confirm.annulerTexte', { motif: aAnnuler?.motif ?? '' })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setAAnnuler(null)}>
            {t('amendes.confirm.retour')}
          </Button>
          <Button type="button" icon={Ban} loading={busy} onClick={confirmerAnnuler}>
            {t('amendes.confirm.confirmerAnnuler')}
          </Button>
        </div>
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={aSupprimer !== null} onClose={() => setASupprimer(null)} title={t('amendes.confirm.supprimerTitre')}>
        <p className="text-sm text-muted-foreground">{t('amendes.confirm.supprimerTexte', { motif: aSupprimer?.motif ?? '' })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setASupprimer(null)}>
            {t('amendes.confirm.retour')}
          </Button>
          <Button type="button" icon={Trash2} loading={busy} onClick={confirmerSupprimer}>
            {t('amendes.confirm.confirmerSupprimer')}
          </Button>
        </div>
      </Modal>
    </>
  )
}

export default AmendesPage
