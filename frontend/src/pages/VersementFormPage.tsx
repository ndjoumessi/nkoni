import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, FileText, Pencil } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { focusPremierChampInvalide } from '@/lib/utils'
import { soumettreOuEnfiler } from '@/lib/offline-sync'
import {
  membresApi,
  contributionsApi,
  versementsApi,
  recusApi,
  ApiError,
  type Contribution,
  type ModeVersement,
  type Recu,
  type VersementCree,
} from '@/lib/api'
import { peutSaisirVersement } from '@/lib/roles'
import { formatMontant } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'

const MODES: ModeVersement[] = ['ESPECES', 'TIERS', 'AUTRE']

const aujourdHui = (): string => new Date().toISOString().slice(0, 10)

/**
 * Saisie d'un versement pour une contribution (POST /versements). Réservé ADMIN + TRESORIERE.
 * Après succès : résumé des totaux réajustés + génération de reçu à la demande (§4.6).
 * Une année de la fenêtre d'adhésion jamais ouverte l'est à la volée POUR CE MEMBRE
 * (POST /contributions/ouvrir-membre) à l'enregistrement. L'ouverture GLOBALE (toute l'org) a
 * migré vers la page Barème (préparation d'exercice).
 */
export function VersementFormPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const presetContrib = searchParams.get('contributionId') ?? ''
  const [membreNom, setMembreNom] = useState('')
  const [contributions, setContributions] = useState<Contribution[]>([])
  // Fenêtre de contribution du membre (§4.1) : [anneeAdhesion .. min(anneeCourante, anneeFin)].
  // Le sélecteur couvre TOUTE la fenêtre — pas seulement les années déjà « ouvertes » — car le
  // montant attendu cumulé les compte déjà. Une année non ouverte l'est à la volée à la saisie.
  const [fenetre, setFenetre] = useState<{ debut: number; fin: number } | null>(null)
  const [anneeChoisie, setAnneeChoisie] = useState<number | null>(null)
  /** Arrivée depuis la ligne d'une année précise → l'année est fixée (déverrouillable au besoin). */
  const [anneeVerrouillee, setAnneeVerrouillee] = useState(false)
  const [montant, setMontant] = useState('')
  const [dateVersement, setDateVersement] = useState(aujourdHui())
  const [mode, setMode] = useState<ModeVersement>('ESPECES')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resultat, setResultat] = useState<VersementCree | null>(null)
  const [errMontant, setErrMontant] = useState<string | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const [recu, setRecu] = useState<Recu | null>(null)
  const [generatingRecu, setGeneratingRecu] = useState(false)

  // Années sélectionnables = TOUTE la fenêtre de contribution, de la plus récente à l'adhésion
  // (et non les seules années déjà ouvertes). Vide si la fenêtre est incohérente.
  const anneesFenetre = useMemo<number[]>(() => {
    if (!fenetre || fenetre.fin < fenetre.debut) return []
    return Array.from({ length: fenetre.fin - fenetre.debut + 1 }, (_, i) => fenetre.fin - i)
  }, [fenetre])

  const chargerContributions = useCallback(
    async (signal?: AbortSignal): Promise<Contribution[]> => {
      if (!accessToken || !id) return []
      const list = await contributionsApi.listByMembre(id, accessToken, signal)
      list.sort((a, b) => b.annee - a.annee)
      setContributions(list)
      return list
    },
    [accessToken, id],
  )

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const [membre, list] = await Promise.all([
          membresApi.get(id, accessToken, signal),
          chargerContributions(signal),
        ])
        if (!active) return
        setMembreNom(`${membre.nom} ${membre.prenom}`)
        // Borne haute : année courante, ramenée à `anneeFinContribution` si le membre a cessé.
        const courante = new Date().getFullYear()
        const fin = Math.min(courante, membre.anneeFinContribution ?? courante)
        setFenetre({ debut: membre.anneeAdhesion, fin })
        // Présélection : la contribution passée en paramètre, sinon l'année la plus récente.
        const preset = presetContrib ? list.find((c) => c.id === presetContrib) : undefined
        setAnneeChoisie(preset?.annee ?? Math.max(membre.anneeAdhesion, fin))
        setAnneeVerrouillee(preset !== undefined)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) toast.error(t('versements.toast.chargementImpossible'), e instanceof ApiError ? e.message : undefined)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, chargerContributions, presetContrib, toast, t])

  if (!peutSaisirVersement(user?.role)) {
    return <Navigate to={id ? `/membres/${id}` : '/membres'} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || anneeChoisie === null) return

    // Validation inline du montant + focus (§8).
    const m = Number(montant)
    const eMontant =
      montant.trim().length === 0
        ? t('versements.form.validation.montantRequis')
        : !Number.isFinite(m) || m <= 0
          ? t('versements.form.validation.montantPositif')
          : undefined
    setErrMontant(eMontant)
    if (eMontant) {
      requestAnimationFrame(() => focusPremierChampInvalide(formRef.current))
      return
    }
    setSaving(true)

    // L'année choisie peut ne pas avoir de ligne Contribution (jamais ouverte globalement) : on
    // l'ouvre alors à la volée POUR CE MEMBRE (idempotent côté serveur) avant d'encaisser.
    let cible = contributions.find((c) => c.annee === anneeChoisie)?.id ?? ''
    if (!cible) {
      try {
        const creee = await contributionsApi.ouvrirMembre(id ?? '', anneeChoisie, accessToken)
        cible = creee.id
        await chargerContributions()
      } catch (err) {
        setSaving(false)
        toast.error(
          t('versements.toast.ouvertureImpossible'),
          err instanceof ApiError ? err.message : t('versements.toast.ouvertureEchec'),
        )
        return
      }
    }

    const payload = {
      contributionId: cible,
      montant: Number(montant),
      dateVersement,
      mode,
      ...(note.trim() ? { note: note.trim() } : {}),
    }
    try {
      // Écriture optimiste : hors-ligne → mise en file (rejeu idempotent au retour du réseau).
      const { enFile, resultat: res } = await soumettreOuEnfiler('versement', payload, () =>
        versementsApi.create(payload, accessToken),
      )
      if (enFile || !res) {
        toast.success(t('offline.enFileTitre'), t('offline.enFileDetail'))
        navigate(id ? `/membres/${id}` : '/membres', { replace: true })
        return
      }
      setResultat(res)
      toast.success(
        t('versements.toast.enregistre'),
        t('versements.resume', { montant: formatMontant(res.versement.montant), annee: res.contribution.annee }),
      )
    } catch (e) {
      toast.error(
        t('versements.toast.enregistrementImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.enregistrementEchec'),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleGenererRecu = async () => {
    if (!accessToken || !resultat) return
    setGeneratingRecu(true)
    try {
      const r = await recusApi.generer(resultat.versement.id, accessToken)
      setRecu(r)
      toast.success(t('versements.toast.recuGenere'), t('versements.toast.recuNumero', { numero: r.numero }))
    } catch (e) {
      toast.error(
        t('versements.toast.generationImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.generationEchec'),
      )
    } finally {
      setGeneratingRecu(false)
    }
  }

  const nouveauVersement = () => {
    setResultat(null)
    setRecu(null)
    setMontant('')
    setNote('')
    setDateVersement(aujourdHui())
  }

  const backTo = id ? `/membres/${id}` : '/membres'

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        overline={t('versements.form.header.overline')}
        title={t('versements.form.header.titre')}
        description={membreNom || undefined}
        back={{ to: backTo, label: t('versements.form.header.back') }}
      />

      {loading ? (
        <Card className="mt-7 space-y-4 p-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </Card>
      ) : resultat ? (
        /* --- Résumé après succès --- */
        <div className="nk-reveal nk-d2 mt-7 space-y-4">
          <Card className="border-jade/30 bg-jade/[0.07] p-6">
            <div className="flex items-center gap-2 text-jade">
              <Check className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-semibold">{t('versements.form.succesTitre')}</h2>
            </div>
            <p className="num mt-3 text-sm text-foreground/85">
              {t('versements.resume', {
                montant: formatMontant(resultat.versement.montant),
                annee: resultat.contribution.annee,
              })}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
                  {t('versements.form.totalVerse')}
                </dt>
                <dd className="num mt-1 font-semibold text-foreground">
                  {formatMontant(resultat.contribution.montantVerse)}
                </dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
                  {t('versements.form.totalValorise')}
                </dt>
                <dd className="num mt-1 font-semibold text-foreground">
                  {formatMontant(resultat.contribution.montantValorise)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            {recu ? (
              <Badge tone="jade" size="lg">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t('versements.form.recuGenere', { numero: recu.numero })}
              </Badge>
            ) : (
              <Button icon={FileText} loading={generatingRecu} onClick={handleGenererRecu}>
                {t('versements.form.genererRecu')}
              </Button>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={nouveauVersement}>
              {t('versements.form.nouveauVersement')}
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/membres/${id}`)}>
              {t('versements.form.retourFiche')}
            </Button>
          </div>
        </div>
      ) : (
        /* --- Formulaire --- */
        <Card className="nk-reveal nk-d2 mt-7 p-6">
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
            {anneesFenetre.length === 0 ? (
              <p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
                {t('versements.form.aucuneContribution')}
              </p>
            ) : anneeVerrouillee && anneeChoisie !== null ? (
              /* Entrée CONTEXTUELLE (« + Versement » depuis la ligne d'une année) : l'année est une
                 donnée du contexte, pas un choix — l'afficher en lecture seule évite d'encaisser par
                 erreur sur une autre année. Sortie explicite si l'utilisateur veut vraiment changer. */
              <Field label={t('versements.form.anneeLabel')}>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="num rounded-xl border border-hairline bg-surface-2 px-4 py-2.5 text-sm text-foreground">
                    {(() => {
                      const c = contributions.find((x) => x.annee === anneeChoisie)
                      return c
                        ? t('versements.form.option', {
                            annee: anneeChoisie,
                            verse: formatMontant(c.montantVerse),
                            attendu: formatMontant(c.montantAttendu),
                          })
                        : t('versements.form.optionNonOuverte', { annee: anneeChoisie })
                    })()}
                  </p>
                  {/* `outline` + icône : au repos, un `ghost` n'a ni bordure ni soulignement et se
                      lit comme une légende, pas comme un contrôle. Même motif que « Modifier »
                      ailleurs dans l'app → l'affordance est immédiatement reconnaissable. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={Pencil}
                    onClick={() => setAnneeVerrouillee(false)}
                  >
                    {t('versements.form.changerAnnee')}
                  </Button>
                </div>
              </Field>
            ) : (
              <Field label={t('versements.form.anneeLabel')} required>
                <Select
                  required
                  value={anneeChoisie ?? ''}
                  onChange={(e) => setAnneeChoisie(Number(e.target.value))}
                >
                  {anneesFenetre.map((an) => {
                    const c = contributions.find((x) => x.annee === an)
                    return (
                      <option key={an} value={an}>
                        {c
                          ? t('versements.form.option', {
                              annee: an,
                              verse: formatMontant(c.montantVerse),
                              attendu: formatMontant(c.montantAttendu),
                            })
                          : t('versements.form.optionNonOuverte', { annee: an })}
                      </option>
                    )
                  })}
                </Select>
              </Field>
            )}

            {anneesFenetre.length > 0 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t('versements.form.montant')} required error={errMontant}>
                    <Input
                      type="number"
                      min={1}
                      value={montant}
                      onChange={(e) => {
                        setMontant(e.target.value)
                        setErrMontant(undefined)
                      }}
                    />
                  </Field>
                  <Field label={t('versements.form.date')} required>
                    <DatePicker value={dateVersement} onChange={setDateVersement} />
                  </Field>
                  <Field label={t('versements.form.mode')} required>
                    <Select value={mode} onChange={(e) => setMode(e.target.value as ModeVersement)}>
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {t(`versements.modes.${m}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label={t('versements.form.note')}>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </Field>

                <div className="flex justify-end">
                  <Button type="submit" loading={saving} disabled={anneeChoisie === null}>
                    {t('versements.form.enregistrer')}
                  </Button>
                </div>
              </>
            )}

          </form>
        </Card>
      )}
    </div>
  )
}

export default VersementFormPage
