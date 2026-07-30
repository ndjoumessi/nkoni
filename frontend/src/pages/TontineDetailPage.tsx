import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Circle, CircleDollarSign, Dices, HandCoins, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  tontinesApi,
  membresApi,
  messageErreur,
  type TontineDetail,
  type CycleTontine,
  type TourTontine,
  type MembreStatut,
} from '@/lib/api'
import { peutVoirTontines, peutGererTontines, peutFluxArgentTontine } from '@/lib/roles'
import { cleI18n } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import { Montant } from '@/components/ui/Montant'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { SelecteurMembreUnique } from '@/components/membres/SelecteurMembreUnique'

interface ParticipantBrouillon {
  membreId: string
  parts: number
}

/** Détail d'une tontine : cycle courant (rotation + tours) et historique. */
export function TontineDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const gestion = peutGererTontines(user?.role)
  const fluxArgent = peutFluxArgentTontine(user?.role)

  const [tontine, setTontine] = useState<TontineDetail | null>(null)
  const [membres, setMembres] = useState<MembreStatut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tirageEnCours, setTirageEnCours] = useState<string | null>(null)
  const [reversementEnCours, setReversementEnCours] = useState<string | null>(null)

  // Ouverture de cycle.
  const [modaleCycle, setModaleCycle] = useState(false)
  const [brouillon, setBrouillon] = useState<ParticipantBrouillon[]>([])
  const [membreAAjouter, setMembreAAjouter] = useState('')
  const [ouvertureEnCours, setOuvertureEnCours] = useState(false)
  const [errParticipants, setErrParticipants] = useState<string | undefined>(undefined)

  // Enregistrement d'une mise.
  const [modaleMise, setModaleMise] = useState<TourTontine | null>(null)
  const [miseMembreId, setMiseMembreId] = useState('')
  const [miseMontant, setMiseMontant] = useState('')
  const [miseEnCours, setMiseEnCours] = useState(false)
  const [errMiseMembre, setErrMiseMembre] = useState<string | undefined>(undefined)

  const charger = async (signal?: AbortSignal) => {
    if (!accessToken) return
    const [detail, liste] = await Promise.all([
      tontinesApi.get(id, accessToken, signal),
      membresApi.listStatuts(accessToken, signal).catch(() => [] as MembreStatut[]),
    ])
    setTontine(detail)
    setMembres(liste)
  }

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        await charger(controller.signal)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (actif) setError(messageErreur(e))
      } finally {
        if (actif) setLoading(false)
      }
    })()
    return () => {
      actif = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, id])

  const nomParMembre = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of membres) map.set(m.id, `${m.prenom} ${m.nom}`.trim())
    return map
  }, [membres])

  if (!peutVoirTontines(user?.role)) return <Navigate to="/dashboard" replace />

  const cycleCourant = tontine?.cycles.find((c) => c.statut === 'EN_COURS') ?? null
  const historique = tontine?.cycles.filter((c) => c.statut !== 'EN_COURS') ?? []

  /** Pot ATTENDU d'un tour = Σ(parts du cycle) × mise de base — l'objectif de collecte, à
   *  comparer au `collecte()` réel ci-dessous (les mises sont renvoyées par `getTontine`). */
  const potAttendu = (cycle: CycleTontine): number =>
    cycle.participations.reduce((s, p) => s + p.parts, 0) * (tontine?.montantBaseMise ?? 0)

  /** Collecté à ce jour pour un tour = Σ des mises déjà enregistrées (§ suivi de collecte). */
  const collecte = (tour: TourTontine): number => tour.mises.reduce((s, m) => s + m.montant, 0)

  const tirer = async (tourId: string) => {
    if (!accessToken || !tontine) return
    const precedent = tontine
    setTirageEnCours(tourId)
    try {
      const { beneficiaireId } = await tontinesApi.tirer(tourId, accessToken)
      setTontine((tn) =>
        tn
          ? {
              ...tn,
              cycles: tn.cycles.map((c) => ({
                ...c,
                tours: c.tours.map((to) => (to.id === tourId ? { ...to, beneficiaireId } : to)),
              })),
            }
          : tn,
      )
      toast.success(t('tontines.detail.tirageSucces'))
    } catch (e) {
      setTontine(precedent) // rollback
      toast.error(messageErreur(e))
    } finally {
      setTirageEnCours(null)
    }
  }

  const reverser = async (tourId: string) => {
    if (!accessToken || !tontine) return
    const precedent = tontine
    setReversementEnCours(tourId)
    try {
      const { montantPot } = await tontinesApi.reverser(tourId, accessToken)
      setTontine((tn) =>
        tn
          ? {
              ...tn,
              cycles: tn.cycles.map((c) => ({
                ...c,
                tours: c.tours.map((to) =>
                  to.id === tourId
                    ? { ...to, statut: 'REVERSE' as const, montantPot, dateReversement: new Date().toISOString() }
                    : to,
                ),
              })),
            }
          : tn,
      )
      toast.success(t('tontines.detail.reverserSucces'))
    } catch (e) {
      setTontine(precedent) // rollback
      toast.error(messageErreur(e))
    } finally {
      setReversementEnCours(null)
    }
  }

  const ouvrirCycle = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    if (brouillon.length < 2) {
      setErrParticipants(t('tontines.ouvrirCycleModale.minimumDeux'))
      return
    }
    setErrParticipants(undefined)
    setOuvertureEnCours(true)
    try {
      await tontinesApi.ouvrirCycle(
        id,
        brouillon.map((p) => ({ membreId: p.membreId, parts: p.parts })),
        accessToken,
      )
      // Rechargement plutôt que MAJ optimiste : le serveur génère cycle, tours et — en ORDRE_FIXE —
      // les bénéficiaires. Les recalculer côté client dupliquerait la règle de rotation.
      await charger()
      setModaleCycle(false)
      setBrouillon([])
      toast.success(t('tontines.ouvrirCycleModale.succes'))
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setOuvertureEnCours(false)
    }
  }

  const enregistrerMise = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !modaleMise) return
    if (!miseMembreId) {
      setErrMiseMembre(t('tontines.miseModale.membreRequis'))
      return
    }
    setErrMiseMembre(undefined)
    setMiseEnCours(true)
    try {
      const montantNombre = Number(miseMontant)
      await tontinesApi.enregistrerMise(
        modaleMise.id,
        miseMembreId,
        accessToken,
        miseMontant.trim() !== '' && Number.isFinite(montantNombre) ? montantNombre : undefined,
      )
      // Rechargement : la mise met à jour la checklist payé/non-payé + le collecté du tour.
      await charger()
      setModaleMise(null)
      setMiseMembreId('')
      setMiseMontant('')
      toast.success(t('tontines.detail.miseSucces'))
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setMiseEnCours(false)
    }
  }

  const ajouterParticipant = () => {
    if (!membreAAjouter) return
    if (brouillon.some((p) => p.membreId === membreAAjouter)) return
    setBrouillon((b) => [...b, { membreId: membreAAjouter, parts: 1 }])
    setMembreAAjouter('')
    setErrParticipants(undefined)
  }

  const rendreTour = (cycle: CycleTontine, tour: TourTontine) => {
    const nom = tour.beneficiaireId ? nomParMembre.get(tour.beneficiaireId) : null
    const reverse = tour.statut === 'REVERSE'
    const peutTirer =
      gestion && tontine?.modeRotation === 'TIRAGE' && tour.beneficiaireId === null && !reverse
    // Suivi de collecte du tour : collecté vs pot attendu → barre de progression + garde du reversement.
    const colleTour = collecte(tour)
    const attTour = potAttendu(cycle)
    const pctTour = attTour > 0 ? Math.min(100, (colleTour / attTour) * 100) : 0
    return (
      <li key={tour.id} className="rounded-xl border border-hairline bg-surface/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('tontines.detail.tour', { numero: tour.numero })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('tontines.detail.beneficiaire')} ·{' '}
              {nom ?? (
                <span className="text-faint">{t('tontines.detail.beneficiaireNonAttribue')}</span>
              )}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              color: reverse ? 'var(--jade)' : 'var(--amber)',
              borderColor: `color-mix(in oklch, var(${reverse ? '--jade' : '--amber'}) 35%, transparent)`,
              backgroundColor: `color-mix(in oklch, var(${reverse ? '--jade' : '--amber'}) 10%, transparent)`,
            }}
          >
            {t(cleI18n(`tontines.statutsTour.${tour.statut}`))}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {reverse ? (
            <div>
              <span className="text-xs text-faint">{t('tontines.detail.potReverse')}</span>{' '}
              <Montant value={tour.montantPot} className="text-sm" />
            </div>
          ) : (
            <div>
              <span className="text-xs text-faint">{t('tontines.detail.collecte')}</span>{' '}
              <Montant value={collecte(tour)} className="text-sm" />
              <span className="text-xs text-faint"> / </span>
              <Montant value={potAttendu(cycle)} className="text-sm text-faint" />
            </div>
          )}
          {reverse && tour.dateReversement && (
            <span className="text-xs text-faint">
              {t('tontines.detail.reverseLe', { date: formatDate(tour.dateReversement) })}
            </span>
          )}
        </div>

        {/* Barre de progression de la collecte (le ratio parle plus en visuel qu'en texte). */}
        {!reverse && (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={Math.round(pctTour)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('tontines.detail.collecte')}
          >
            <div className="h-full rounded-full bg-jade transition-all" style={{ width: `${pctTour}%` }} />
          </div>
        )}

        {/* Suivi de collecte : qui a versé sa mise pour ce tour, qui reste dû (§ suivi de collecte). */}
        {!reverse && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {cycle.participations.map((p) => {
              const paye = tour.mises.some((m) => m.membreId === p.membreId)
              const ton = paye ? '--jade' : '--terra'
              return (
                <li
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                  style={{
                    color: `var(${ton})`,
                    borderColor: `color-mix(in oklch, var(${ton}) 30%, transparent)`,
                    backgroundColor: `color-mix(in oklch, var(${ton}) 8%, transparent)`,
                  }}
                >
                  {paye ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Circle className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>{nomParMembre.get(p.membreId) ?? p.membreId}</span>
                </li>
              )
            })}
          </ul>
        )}

        {(peutTirer || (fluxArgent && !reverse)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {peutTirer && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Dices}
                loading={tirageEnCours === tour.id}
                onClick={() => void tirer(tour.id)}
              >
                {t('tontines.detail.tirer')}
              </Button>
            )}
            {fluxArgent && !reverse && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={HandCoins}
                  onClick={() => setModaleMise(tour)}
                >
                  {t('tontines.detail.enregistrerMise')}
                </Button>
                {tour.beneficiaireId && (
                  <Button
                    type="button"
                    size="sm"
                    loading={reversementEnCours === tour.id}
                    // Reverser un pot VIDE n'a pas de sens (flux d'argent) : garde tant que rien
                    // n'est collecté, avec le motif en infobulle.
                    disabled={colleTour === 0}
                    title={colleTour === 0 ? t('tontines.detail.reverserVide') : undefined}
                    onClick={() => void reverser(tour.id)}
                  >
                    {t('tontines.detail.reverser')}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      <PageHeader
        overline={t('tontines.liste.overline')}
        title={tontine?.nom ?? t('tontines.liste.titre')}
        description={
          tontine ? t(cleI18n(`tontines.modesAide.${tontine.modeRotation}`)) : undefined
        }
        actions={
          <Link
            to="/tontines"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('tontines.detail.retour')}
          </Link>
        }
      />

      <div className="nk-reveal nk-d2 mt-7 space-y-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={5} />
          </Card>
        )}

        {!loading && error && (
          <ErrorState title={t('commun.erreurs.chargementImpossible')} description={error} />
        )}

        {!loading && !error && tontine && (
          <>
            {/* Cycle courant */}
            {cycleCourant ? (
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Overline>{t('tontines.detail.cycleCourant')}</Overline>
                    <h2 className="mt-1 font-medium text-foreground">
                      {t('tontines.detail.cycleNumero', { numero: cycleCourant.numero })}
                    </h2>
                  </div>
                  {tontine.modeRotation === 'ENCHERE' && (
                    <p className="text-xs text-faint">{t('tontines.detail.enchereAVenir')}</p>
                  )}
                </div>

                <div className="mt-5">
                  <Overline>{t('tontines.detail.rotation')}</Overline>
                  <ol className="mt-2 flex flex-wrap gap-2">
                    {cycleCourant.participations.map((p) => (
                      <li
                        key={p.id}
                        className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-2/60 px-3 py-1 text-xs"
                      >
                        <span className="text-faint num">{p.ordre}</span>
                        <span className="text-foreground">
                          {nomParMembre.get(p.membreId) ?? p.membreId}
                        </span>
                        {p.parts > 1 && (
                          <span className="text-faint">
                            {t('tontines.detail.parts', { count: p.parts })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-5">
                  <Overline>{t('tontines.detail.tours')}</Overline>
                  <ul className="mt-2 space-y-2">
                    {cycleCourant.tours.map((tour) => rendreTour(cycleCourant, tour))}
                  </ul>
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={CircleDollarSign}
                title={t('tontines.detail.aucunCycle')}
                description={t('tontines.detail.aucunCycleTexte')}
                action={
                  gestion ? (
                    <Button type="button" icon={Plus} onClick={() => setModaleCycle(true)}>
                      {t('tontines.detail.ouvrirCycle')}
                    </Button>
                  ) : undefined
                }
              />
            )}

            {/* Historique */}
            <Card className="p-5">
              <Overline>{t('tontines.detail.historique')}</Overline>
              {historique.length === 0 ? (
                <p className="mt-2 text-sm text-faint">{t('tontines.detail.historiqueVide')}</p>
              ) : (
                <ul className="mt-3 space-y-4">
                  {historique.map((cycle) => (
                    <li key={cycle.id}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {t('tontines.detail.cycleNumero', { numero: cycle.numero })}
                        </span>
                        <span className="text-xs text-faint">
                          {t(cleI18n(`tontines.statutsCycle.${cycle.statut}`))}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {cycle.tours
                          .filter((to) => to.statut === 'REVERSE')
                          .map((to) => (
                            <li
                              key={to.id}
                              className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground"
                            >
                              <span>{t('tontines.detail.tour', { numero: to.numero })}</span>
                              <span className="text-foreground">
                                {to.beneficiaireId
                                  ? (nomParMembre.get(to.beneficiaireId) ?? to.beneficiaireId)
                                  : t('tontines.detail.beneficiaireNonAttribue')}
                              </span>
                              <Montant value={to.montantPot} className="text-xs" />
                              {to.dateReversement && <span>{formatDate(to.dateReversement)}</span>}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Ouverture d'un cycle */}
      <Modal
        open={modaleCycle}
        onClose={() => setModaleCycle(false)}
        title={t('tontines.ouvrirCycleModale.titre')}
      >
        <form onSubmit={ouvrirCycle} className="space-y-4" noValidate>
          <p className="text-xs text-muted-foreground">{t('tontines.ouvrirCycleModale.aide')}</p>

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelecteurMembreUnique
                membres={membres}
                valeur={membreAAjouter}
                onChange={setMembreAAjouter}
                placeholder={t('tontines.ouvrirCycleModale.choisirMembre')}
                ariaLabel={t('tontines.ouvrirCycleModale.choisirMembre')}
              />
            </div>
            <Button type="button" variant="outline" icon={Plus} onClick={ajouterParticipant}>
              {t('tontines.ouvrirCycleModale.ajouter')}
            </Button>
          </div>

          {brouillon.length === 0 ? (
            <p className="text-xs text-faint">{t('tontines.ouvrirCycleModale.aucunParticipant')}</p>
          ) : (
            <ol className="space-y-2">
              {brouillon.map((p, i) => (
                <li key={p.membreId} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-faint num">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {nomParMembre.get(p.membreId) ?? p.membreId}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="w-20"
                    aria-label={t('tontines.ouvrirCycleModale.parts')}
                    value={String(p.parts)}
                    onChange={(e) =>
                      setBrouillon((b) =>
                        b.map((x, j) =>
                          j === i ? { ...x, parts: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label={t('tontines.ouvrirCycleModale.retirer')}
                    onClick={() => setBrouillon((b) => b.filter((_, j) => j !== i))}
                  />
                </li>
              ))}
            </ol>
          )}

          {errParticipants && (
            <p role="alert" className="text-xs text-terra">
              {errParticipants}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setModaleCycle(false)}>
              {t('tontines.creation.annuler')}
            </Button>
            <Button type="submit" loading={ouvertureEnCours}>
              {t('tontines.ouvrirCycleModale.valider')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Enregistrement d'une mise */}
      <Modal
        open={modaleMise !== null}
        onClose={() => setModaleMise(null)}
        title={t('tontines.miseModale.titre')}
      >
        <form onSubmit={enregistrerMise} className="space-y-4" noValidate>
          <Field label={t('tontines.miseModale.membre')} error={errMiseMembre}>
            <SelecteurMembreUnique
              membres={
                cycleCourant
                  ? membres.filter((m) =>
                      cycleCourant.participations.some((p) => p.membreId === m.id),
                    )
                  : membres
              }
              valeur={miseMembreId}
              onChange={setMiseMembreId}
              placeholder={t('tontines.miseModale.membre')}
              ariaLabel={t('tontines.miseModale.membre')}
            />
          </Field>
          <Field
            label={t('tontines.miseModale.montant')}
            hint={t('tontines.miseModale.montantAide')}
          >
            <Input
              id="mise-montant"
              type="number"
              min={0}
              inputMode="numeric"
              value={miseMontant}
              onChange={(e) => setMiseMontant(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setModaleMise(null)}>
              {t('tontines.creation.annuler')}
            </Button>
            <Button type="submit" loading={miseEnCours}>
              {t('tontines.miseModale.valider')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default TontineDetailPage
