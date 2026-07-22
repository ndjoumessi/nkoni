import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { HeartHandshake, Pencil, Plus, Trash2, Lock, Unlock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  cagnottesApi,
  membresApi,
  ApiError,
  messageErreur,
  type CagnotteDetail,
  type DonCagnotte,
  type MembreStatut,
  type ModeVersement,
} from '@/lib/api'
import { peutVoirCagnottes, peutGererCagnotte, peutSaisirDon } from '@/lib/roles'
import { formatMontant } from '@/lib/format'
import { Montant } from '@/components/ui/Montant'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelecteurMembreUnique } from '@/components/membres/SelecteurMembreUnique'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

const MODES: ModeVersement[] = ['ESPECES', 'TIERS', 'AUTRE']

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

function Ligne({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`num mt-0.5 font-semibold ${tone ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

/** Détail d'une cagnotte d'événement (§4.9) — infos, dons, clôture/reversement. */
export function CagnotteDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [c, setC] = useState<CagnotteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [membres, setMembres] = useState<MembreStatut[]>([])

  const [modal, setModal] = useState<'don' | 'cloture' | 'suppr' | null>(null)
  const [donASupprimer, setDonASupprimer] = useState<DonCagnotte | null>(null)
  const [busy, setBusy] = useState(false)

  // Formulaire don.
  const [donMembre, setDonMembre] = useState('')
  const [donMontant, setDonMontant] = useState('')
  const [donDate, setDonDate] = useState(aujourdHui())
  const [donMode, setDonMode] = useState<ModeVersement>('ESPECES')
  const [donNote, setDonNote] = useState('')
  // Formulaire clôture.
  const [reverse, setReverse] = useState('')
  const [dateReverse, setDateReverse] = useState(aujourdHui())

  const gestion = peutGererCagnotte(user?.role)
  const argent = peutSaisirDon(user?.role)

  const recharger = async (signal?: AbortSignal) => {
    if (!accessToken || !id) return
    const data = await cagnottesApi.get(id, accessToken, signal)
    setC(data)
  }

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [data, liste] = await Promise.all([
          cagnottesApi.get(id, accessToken, controller.signal),
          membresApi.listStatuts(accessToken, controller.signal).catch(() => [] as MembreStatut[]),
        ])
        if (!active) return
        setC(data)
        setMembres(liste)
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
  }, [accessToken, id])

  if (!peutVoirCagnottes(user?.role)) return <Navigate to="/dashboard" replace />

  const ouverte = c?.statut === 'OUVERTE'

  const ajouterDon = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !id) return
    const montant = Math.round(Number(donMontant))
    if (!donMembre) return toast.error(t('cagnottes.don.validationMembre'))
    if (!montant || montant <= 0) return toast.error(t('cagnottes.don.validationMontant'))
    setBusy(true)
    try {
      await cagnottesApi.ajouterDon(
        id,
        {
          membreId: donMembre,
          montant,
          date: new Date(donDate).toISOString(),
          mode: donMode,
          ...(donNote.trim() ? { note: donNote.trim() } : {}),
        },
        accessToken,
      )
      await recharger()
      toast.success(t('cagnottes.don.toast.ajoute'))
      setModal(null)
      setDonMembre('')
      setDonMontant('')
      setDonNote('')
    } catch (err) {
      toast.error(t('cagnottes.don.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmerSupprDon = async () => {
    if (!accessToken || !id || !donASupprimer) return
    setBusy(true)
    try {
      await cagnottesApi.supprimerDon(id, donASupprimer.id, accessToken)
      await recharger()
      toast.success(t('cagnottes.detail.toast.donSupprime'))
      setDonASupprimer(null)
    } catch (err) {
      toast.error(t('cagnottes.detail.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const cloturer = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !id || !c) return
    const montant = reverse.trim() ? Math.round(Number(reverse)) : 0
    if (montant > c.collecte) return toast.error(t('cagnottes.cloture.validationMontant'))
    setBusy(true)
    try {
      await cagnottesApi.cloturer(
        id,
        { montantReverse: montant, dateReversement: new Date(dateReverse).toISOString() },
        accessToken,
      )
      await recharger()
      toast.success(t('cagnottes.cloture.toast.cloturee'))
      setModal(null)
    } catch (err) {
      toast.error(t('cagnottes.cloture.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const rouvrir = async () => {
    if (!accessToken || !id) return
    setBusy(true)
    try {
      await cagnottesApi.rouvrir(id, accessToken)
      await recharger()
      toast.success(t('cagnottes.detail.toast.rouverte'))
    } catch (err) {
      toast.error(t('cagnottes.detail.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setBusy(false)
    }
  }

  const supprimerCagnotte = async () => {
    if (!accessToken || !id) return
    setBusy(true)
    try {
      await cagnottesApi.remove(id, accessToken)
      toast.success(t('cagnottes.detail.toast.supprimee'))
      navigate('/cagnottes')
    } catch (err) {
      toast.error(t('cagnottes.detail.toast.erreur'), err instanceof ApiError ? err.message : messageErreur(err))
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader overline={t('cagnottes.liste.overline')} title="…" back={{ to: '/cagnottes', label: t('cagnottes.detail.retour') }} />
        <Card className="nk-reveal nk-d2 mt-7 h-48 animate-pulse bg-surface-2/40" />
      </>
    )
  }
  if (error || !c) {
    return (
      <>
        <PageHeader overline={t('cagnottes.liste.overline')} title={t('cagnottes.detail.retour')} back={{ to: '/cagnottes', label: t('cagnottes.detail.retour') }} />
        <Card className="nk-reveal nk-d2 mt-7 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {error ?? t('cagnottes.detail.erreurChargement')}
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        overline={`${t(`cagnottes.types.${c.type}`)} · ${t(`cagnottes.statuts.${c.statut}`)}`}
        title={c.titre}
        back={{ to: '/cagnottes', label: t('cagnottes.detail.retour') }}
        actions={
          <>
            {argent && ouverte && (
              <Button icon={Plus} onClick={() => setModal('don')}>
                {t('cagnottes.detail.ajouterDon')}
              </Button>
            )}
            {argent && ouverte && (
              <Button variant="outline" icon={Lock} onClick={() => { setReverse(String(c.collecte)); setModal('cloture') }}>
                {t('cagnottes.detail.cloturer')}
              </Button>
            )}
            {argent && !ouverte && (
              <Button variant="outline" icon={Unlock} loading={busy} onClick={rouvrir}>
                {t('cagnottes.detail.rouvrir')}
              </Button>
            )}
            {gestion && ouverte && (
              <ButtonLink to={`/cagnottes/${c.id}/editer`} variant="outline" icon={Pencil}>
                {t('cagnottes.detail.modifier')}
              </ButtonLink>
            )}
            {argent && (
              <Button variant="ghost" icon={Trash2} onClick={() => setModal('suppr')}>
                {t('cagnottes.detail.supprimer')}
              </Button>
            )}
          </>
        }
      />

      <div className="nk-reveal nk-d2 mt-7 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Overline>{t('cagnottes.detail.donsTitre')}</Overline>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Ligne label={t('cagnottes.detail.collecte')} value={<Montant value={c.collecte} />} tone="text-jade" />
            <Ligne label={t('cagnottes.detail.reverse')} value={<Montant value={c.montantReverse} />} />
            <Ligne label={t('cagnottes.detail.solde')} value={<Montant value={c.solde} />} tone="text-brass" />
            {c.objectif != null && <Ligne label={t('cagnottes.detail.objectif')} value={<Montant value={c.objectif} />} />}
            {c.beneficiaire && <Ligne label={t('cagnottes.detail.beneficiaire')} value={c.beneficiaire} />}
            {c.dateEvenement && <Ligne label={t('cagnottes.detail.evenement')} value={formatDate(c.dateEvenement)} />}
          </div>
          {c.progression != null && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-gradient-to-r from-jade to-brass" style={{ width: `${c.progression}%` }} />
              </div>
              <p className="mt-1 text-xs text-faint">{t('cagnottes.liste.progression', { pct: c.progression })}</p>
            </div>
          )}
          {c.description && <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>}
        </Card>

        <Card className="p-5">
          <Overline>{t('cagnottes.detail.statut')}</Overline>
          <p className="mt-2 text-lg font-semibold text-foreground">{t(`cagnottes.statuts.${c.statut}`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('cagnottes.liste.dons', { count: c.nbDons })}</p>
        </Card>
      </div>

      <Card className="nk-reveal nk-d3 mt-4 overflow-hidden p-0">
        <div className="border-b border-hairline px-5 py-3">
          <Overline>{t('cagnottes.detail.donsTitre')}</Overline>
        </div>
        {c.dons.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">{t('cagnottes.detail.aucunDon')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-2 font-medium">{t('cagnottes.detail.colMembre')}</th>
                <th className="px-5 py-2 font-medium">{t('cagnottes.detail.colDate')}</th>
                <th className="px-5 py-2 font-medium">{t('cagnottes.detail.colMode')}</th>
                <th className="px-5 py-2 text-right font-medium">{t('cagnottes.detail.colMontant')}</th>
                {argent && ouverte && <th className="px-5 py-2" />}
              </tr>
            </thead>
            <tbody>
              {c.dons.map((d) => (
                <tr key={d.id} className="border-b border-hairline/60 last:border-0">
                  <td className="px-5 py-2.5 text-foreground">
                    {d.membre.prenom} {d.membre.nom}
                    {d.note && <span className="block text-xs text-faint">{d.note}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">{formatDate(d.date)}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{t(`cagnottes.modes.${d.mode}`)}</td>
                  <td className="num px-5 py-2.5 text-right font-medium text-foreground">{formatMontant(d.montant)}</td>
                  {argent && ouverte && (
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDonASupprimer(d)}
                        className="text-faint transition-colors hover:text-terra"
                        aria-label={t('cagnottes.detail.supprimerDon')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modale : ajouter un don */}
      <Modal open={modal === 'don'} onClose={() => setModal(null)} title={t('cagnottes.don.titre')}>
        <form onSubmit={ajouterDon} className="space-y-4">
          <Field label={t('cagnottes.don.membre')} required>
            <SelecteurMembreUnique
              membres={membres}
              valeur={donMembre}
              onChange={setDonMembre}
              placeholder={t('cagnottes.don.membrePlaceholder')}
              ariaLabel={t('cagnottes.don.membre')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cagnottes.don.montant')} required>
              <Input
                inputMode="numeric"
                value={donMontant}
                onChange={(e) => setDonMontant(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label={t('cagnottes.don.date')}>
              <DatePicker value={donDate} onChange={setDonDate} />
            </Field>
          </div>
          <Field label={t('cagnottes.don.mode')}>
            <Select value={donMode} onChange={(e) => setDonMode(e.target.value as ModeVersement)}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`cagnottes.modes.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('cagnottes.don.note')}>
            <Textarea value={donNote} onChange={(e) => setDonNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>
              {t('cagnottes.don.annuler')}
            </Button>
            <Button type="submit" icon={HeartHandshake} loading={busy}>
              {t('cagnottes.don.enregistrer')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale : clôturer + reversement */}
      <Modal open={modal === 'cloture'} onClose={() => setModal(null)} title={t('cagnottes.cloture.titre')}>
        <form onSubmit={cloturer} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('cagnottes.cloture.texte', { collecte: formatMontant(c.collecte) })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cagnottes.cloture.montantReverse')}>
              <Input
                inputMode="numeric"
                value={reverse}
                onChange={(e) => setReverse(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
              />
            </Field>
            <Field label={t('cagnottes.cloture.dateReversement')}>
              <DatePicker value={dateReverse} onChange={setDateReverse} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>
              {t('cagnottes.cloture.annuler')}
            </Button>
            <Button type="submit" icon={Lock} loading={busy}>
              {t('cagnottes.cloture.confirmer')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale : supprimer la cagnotte */}
      <Modal open={modal === 'suppr'} onClose={() => setModal(null)} title={t('cagnottes.detail.confirmSupprTitre')}>
        <p className="text-sm text-muted-foreground">{t('cagnottes.detail.confirmSupprTexte', { titre: c.titre })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setModal(null)}>
            {t('cagnottes.detail.annuler')}
          </Button>
          <Button type="button" icon={Trash2} loading={busy} onClick={supprimerCagnotte}>
            {t('cagnottes.detail.confirmer')}
          </Button>
        </div>
      </Modal>

      {/* Modale : retirer un don */}
      <Modal open={donASupprimer !== null} onClose={() => setDonASupprimer(null)} title={t('cagnottes.detail.confirmSupprDonTitre')}>
        <p className="text-sm text-muted-foreground">
          {t('cagnottes.detail.confirmSupprDonTexte', {
            montant: donASupprimer ? formatMontant(donASupprimer.montant) : '',
          })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDonASupprimer(null)}>
            {t('cagnottes.detail.annuler')}
          </Button>
          <Button type="button" icon={Trash2} loading={busy} onClick={confirmerSupprDon}>
            {t('cagnottes.detail.confirmer')}
          </Button>
        </div>
      </Modal>
    </>
  )
}

export default CagnotteDetailPage
