import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, ChevronDown, ChevronRight, CreditCard, Crown, FileText, Pencil, Plus, Scale, Trash2, UserMinus } from 'lucide-react'
import { AvatarMembre } from '@/components/membres/AvatarMembre'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  branchesApi,
  contributionsApi,
  equilibragesApi,
  organisationApi,
  ApiError,
  type Membre,
  type StatutCumule,
  type Contribution,
  type Branche,
  type Equilibrage,
  type ChefOrganisation,
} from '@/lib/api'
import {
  peutGererMembres,
  peutSaisirVersement,
  peutEquilibrer,
  peutGererDocument,
  peutDesignerChef,
} from '@/lib/roles'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { VersementsList } from '@/components/VersementsList'
import { formatMontant } from '@/lib/format'
import { formatDate, ouvrirBlobPdf } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1 break-words text-pretty text-sm text-foreground/85">{value || '—'}</dd>
    </div>
  )
}

/** Format numérique court (jj/mm/aaaa) selon la langue courante. */
const DATE_COURTE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const

/**
 * Fiche complète d'un membre : infos + statut cumulatif (§4.1) + historique des
 * contributions (versements dépliables). Accès en couches selon la matrice §2.
 */
export function MembreDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [membre, setMembre] = useState<Membre | null>(null)
  const [statut, setStatut] = useState<StatutCumule | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [financierAccessible, setFinancierAccessible] = useState(false)
  const [equilibrages, setEquilibrages] = useState<Equilibrage[] | null>(null)
  const [branches, setBranches] = useState<Branche[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Incrémenté par le bouton « Réessayer » de l'ErrorState : relance l'effet de chargement.
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedContrib, setExpandedContrib] = useState<string | null>(null)
  // Chef de l'organisation (§ dirigeant) — badge + actions ADMIN/PRESIDENT.
  const [chef, setChef] = useState<ChefOrganisation | null>(null)
  const [chefModal, setChefModal] = useState<'designer' | 'retirer' | null>(null)
  const [surnom, setSurnom] = useState('')
  const [chefSubmitting, setChefSubmitting] = useState(false)
  const [carteEnCours, setCarteEnCours] = useState(false)
  const [releveEnCours, setReleveEnCours] = useState(false)

  const telechargerCarte = async () => {
    if (!accessToken || !membre) return
    setCarteEnCours(true)
    try {
      ouvrirBlobPdf(await membresApi.telechargerCarte(membre.id, accessToken))
    } catch (e) {
      toast.error(t('membres.carte.erreur'), e instanceof ApiError ? e.message : '')
    } finally {
      setCarteEnCours(false)
    }
  }

  const telechargerReleve = async () => {
    if (!accessToken || !membre) return
    setReleveEnCours(true)
    try {
      ouvrirBlobPdf(await membresApi.telechargerReleve(membre.id, accessToken))
    } catch (e) {
      toast.error(t('membres.releve.erreur'), e instanceof ApiError ? e.message : '')
    } finally {
      setReleveEnCours(false)
    }
  }

  const [photoRefresh, setPhotoRefresh] = useState(0)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const onPhotoChoisie = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = '' // autorise le re-choix du même fichier
    if (!fichier || !accessToken || !membre) return
    setPhotoBusy(true)
    try {
      await membresApi.uploadPhoto(membre.id, fichier, accessToken)
      setPhotoRefresh((k) => k + 1)
      toast.success(t('membres.photo.toast.miseAJour'))
    } catch (err) {
      toast.error(t('membres.photo.toast.erreur'), err instanceof ApiError ? err.message : '')
    } finally {
      setPhotoBusy(false)
    }
  }

  const supprimerPhoto = async () => {
    if (!accessToken || !membre) return
    setPhotoBusy(true)
    try {
      await membresApi.supprimerPhoto(membre.id, accessToken)
      setPhotoRefresh((k) => k + 1)
      toast.success(t('membres.photo.toast.supprimee'))
    } catch (err) {
      toast.error(t('membres.photo.toast.erreur'), err instanceof ApiError ? err.message : '')
    } finally {
      setPhotoBusy(false)
    }
  }

  useEffect(() => {
    if (!accessToken || !id) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const m = await membresApi.get(id, accessToken, signal)
        if (!active) return
        setMembre(m)
        setLoading(false)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (e instanceof ApiError && e.status === 403) {
          navigate('/dashboard', { replace: true })
          return
        }
        if (active) {
          setError(e instanceof ApiError ? e.message : t('membres.detail.erreurChargement'))
          setLoading(false)
        }
        return
      }

      // Contributions : pilote la VISIBILITÉ de la carte financière (lecture `Contribution`).
      // Succès → carte visible ; 403 (pas de droit, ex. SECRETAIRE) ou erreur → carte masquée.
      try {
        const c = await contributionsApi.listByMembre(id, accessToken, signal)
        if (active) {
          setContributions([...c].sort((a, b) => b.annee - a.annee))
          setFinancierAccessible(true)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        /* pas d'accès financier (ex. SECRETAIRE) ou erreur de lecture → carte masquée */
      }

      // Statut cumulatif : AUXILIAIRE (badge + synthèse, déjà null-safe dans le rendu) → chargé
      // indépendamment pour qu'un échec ici ne fasse PAS disparaître la carte ni la saisie.
      try {
        const s = await membresApi.statut(id, accessToken, signal)
        if (active) setStatut(s)
      } catch {
        /* statut best-effort — la carte reste utilisable sans lui */
      }

      try {
        const b = await branchesApi.list(accessToken, signal)
        if (active) setBranches(b)
      } catch {
        /* pas d'accès aux branches → nom non résolu */
      }

      // Équilibrages appliqués : best-effort (lecture ADMIN/PRESIDENT/TRESORIERE/COMMISSAIRE).
      // Le SECRETAIRE / MEMBRE_SIMPLE reçoit 403 → section masquée.
      try {
        const eq = await equilibragesApi.listByMembre(id, accessToken, signal)
        if (active) setEquilibrages(eq)
      } catch {
        /* pas d'accès aux équilibrages → section masquée */
      }

      // Chef de l'organisation : best-effort (bureau OK, MEMBRE_SIMPLE 403) → badge + actions.
      try {
        const org = await organisationApi.moi(accessToken, signal)
        if (active) {
          setChef({
            chefMembreId: org.chefMembreId,
            chefSurnom: org.chefSurnom,
            chefNom: org.chefNom,
            chefPrenom: org.chefPrenom,
          })
        }
      } catch {
        /* pas d'accès → aucune action/badge chef */
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, navigate, t, reloadKey])

  // Rafraîchit les montants affichés après modification/suppression d'un versement
  // (totaux cumulés en tête + totaux par année dans l'accordéon des contributions).
  const rechargerFinancier = useCallback(async () => {
    if (!accessToken || !id) return
    try {
      const [m, c] = await Promise.all([
        membresApi.get(id, accessToken),
        contributionsApi.listByMembre(id, accessToken),
      ])
      setMembre(m)
      setContributions([...c].sort((a, b) => b.annee - a.annee))
    } catch {
      /* rechargement best-effort — les toasts de la liste couvrent déjà l'échec de l'action */
    }
    try {
      const s = await membresApi.statut(id, accessToken)
      setStatut(s)
    } catch {
      /* statut best-effort */
    }
  }, [accessToken, id])

  const brancheNom = useMemo(() => {
    if (!membre?.brancheId) return '—'
    return branches.find((b) => b.id === membre.brancheId)?.nom ?? '—'
  }, [membre, branches])

  const estChef = !!membre && chef?.chefMembreId === membre.id

  const designerChef = async () => {
    if (!membre || !accessToken) return
    setChefSubmitting(true)
    try {
      const res = await organisationApi.definirChef(membre.id, surnom.trim() || null, accessToken)
      setChef(res)
      setChefModal(null)
      setSurnom('')
      toast.success(t('membres.chef.succesDesignation', { nom: `${membre.nom} ${membre.prenom}` }))
    } catch {
      toast.error(t('membres.chef.erreur'))
    } finally {
      setChefSubmitting(false)
    }
  }

  const retirerChef = async () => {
    if (!accessToken) return
    setChefSubmitting(true)
    try {
      const res = await organisationApi.definirChef(null, null, accessToken)
      setChef(res)
      setChefModal(null)
      toast.success(t('membres.chef.succesRetrait'))
    } catch {
      toast.error(t('membres.chef.erreur'))
    } finally {
      setChefSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-6 h-8 w-64" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-56 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('membres.detail.fiche')} back={{ to: '/membres', label: t('membres.detail.retour') }} />
        <ErrorState
          className="mt-6"
          title={t('commun.erreurs.chargementImpossible')}
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    )
  }

  if (!membre) return null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: '/membres', label: t('membres.detail.retour') }}
        title={
          <>
            {membre.nom} <span className="text-muted-foreground">{membre.prenom}</span>
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatutMembreBadge statut={membre.statut} size="sm" />
            {statut && <StatutCotisationBadge statut={statut.statut} size="sm" />}
            {estChef && (
              <Badge tone="brass" size="sm">
                <Crown className="h-3 w-3" aria-hidden="true" />
                {t('membres.chef.estChef')}
                {chef?.chefSurnom ? ` · ${chef.chefSurnom}` : ''}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            {peutEquilibrer(user?.role) && (
              <ButtonLink
                to={`/membres/${membre.id}/equilibrage`}
                variant="outline"
                icon={Scale}
              >
                {t('membres.detail.equilibrer')}
              </ButtonLink>
            )}
            {peutDesignerChef(user?.role) &&
              (estChef ? (
                <Button variant="outline" icon={UserMinus} onClick={() => setChefModal('retirer')}>
                  {t('membres.chef.retirer')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  icon={Crown}
                  onClick={() => {
                    setSurnom('')
                    setChefModal('designer')
                  }}
                >
                  {t('membres.chef.designer')}
                </Button>
              ))}
            {peutGererMembres(user?.role) && (
              <Button
                variant="outline"
                icon={CreditCard}
                loading={carteEnCours}
                onClick={telechargerCarte}
              >
                {t('membres.carte.telecharger')}
              </Button>
            )}
            {peutGererMembres(user?.role) && (
              <Button
                variant="outline"
                icon={FileText}
                loading={releveEnCours}
                onClick={telechargerReleve}
              >
                {t('membres.releve.telecharger')}
              </Button>
            )}
            {peutGererMembres(user?.role) && (
              <ButtonLink to={`/membres/${membre.id}/editer`} variant="outline" icon={Pencil}>
                {t('membres.detail.modifier')}
              </ButtonLink>
            )}
          </>
        }
      />

      <Card className="nk-reveal nk-d1 mt-6 flex items-center gap-4 p-5">
        <AvatarMembre
          membreId={membre.id}
          nom={membre.nom}
          prenom={membre.prenom}
          accessToken={accessToken}
          refreshKey={photoRefresh}
        />
        {peutGererMembres(user?.role) ? (
          <div className="min-w-0">
            <Overline>{t('membres.photo.titre')}</Overline>
            <p className="mt-1 text-sm text-muted-foreground">{t('membres.photo.aide')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={onPhotoChoisie}
              />
              <Button variant="outline" icon={Camera} loading={photoBusy} onClick={() => photoInputRef.current?.click()}>
                {t('membres.photo.changer')}
              </Button>
              <Button variant="ghost" icon={Trash2} onClick={supprimerPhoto}>
                {t('membres.photo.supprimer')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="font-display text-lg font-semibold text-foreground">
            {membre.nom} <span className="text-muted-foreground">{membre.prenom}</span>
          </p>
        )}
      </Card>

      {statut && (
        <section className="nk-reveal nk-d2 mt-7 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <Overline>{t('membres.detail.totalAttendu')}</Overline>
            <p className="num mt-2 text-xl font-semibold text-foreground">
              {formatMontant(statut.totalAttenduCumule)}
            </p>
          </Card>
          <Card className="p-5">
            <Overline>{t('membres.detail.totalValorise')}</Overline>
            <p className="num mt-2 text-xl font-semibold text-jade">
              {formatMontant(statut.totalValoriseCumule)}
            </p>
          </Card>
        </section>
      )}

      <Card className="nk-reveal nk-d3 mt-4 p-6">
        <Overline>{t('membres.detail.informations')}</Overline>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <Info
            label={t('membres.detail.info.sexe')}
            // Enum brut M/F → libellé traduit ; valeur absente/inattendue → tiret (M7).
            value={membre.sexe === 'M' || membre.sexe === 'F' ? t(`membres.sexe.${membre.sexe}`) : '—'}
          />
          <Info label={t('membres.detail.info.dateNaissance')} value={formatDate(membre.dateNaissance, DATE_COURTE)} />
          <Info label={t('membres.detail.info.fonctionSociale')} value={membre.fonctionSociale ?? '—'} />
          <Info label={t('membres.detail.info.brancheFamiliale')} value={brancheNom} />
          <Info label={t('membres.detail.info.telephone')} value={membre.telephone ?? '—'} />
          <Info label={t('membres.detail.info.adresse')} value={membre.adresse ?? '—'} />
          <Info label={t('membres.detail.info.anneeAdhesion')} value={String(membre.anneeAdhesion)} />
          <Info
            label={t('membres.detail.info.finContribution')}
            value={membre.anneeFinContribution ? String(membre.anneeFinContribution) : '—'}
          />
        </dl>
      </Card>

      {financierAccessible && (
        <Card className="nk-reveal nk-d4 mt-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Overline>{t('membres.detail.contributions')}</Overline>
            {peutSaisirVersement(user?.role) && (
              <ButtonLink
                to={`/membres/${membre.id}/versements/nouveau`}
                variant="outline"
                size="sm"
                icon={Plus}
              >
                {t('membres.detail.saisirVersement')}
              </ButtonLink>
            )}
          </div>
          {contributions.length === 0 ? (
            <p className="mt-4 text-sm text-faint">
              {t('membres.detail.aucuneContribution')}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {contributions.map((c) => {
                const expanded = expandedContrib === c.id
                return (
                  <li
                    key={c.id}
                    className="overflow-hidden rounded-xl border border-hairline bg-surface/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedContrib(expanded ? null : c.id)}
                        className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-brass"
                        aria-expanded={expanded}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-brass" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-faint" aria-hidden="true" />
                        )}
                        {t('membres.detail.annee', { annee: c.annee })}
                      </button>
                      <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t('membres.detail.attendu', { montant: formatMontant(c.montantAttendu) })}</span>
                        <span>{t('membres.detail.verse', { montant: formatMontant(c.montantVerse) })}</span>
                        <span className="text-jade">{t('membres.detail.valorise', { montant: formatMontant(c.montantValorise) })}</span>
                      </div>
                      {peutSaisirVersement(user?.role) && (
                        <Link
                          to={`/membres/${membre.id}/versements/nouveau?contributionId=${c.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-2/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-brass/40 hover:bg-surface-3"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('membres.detail.versement')}
                        </Link>
                      )}
                    </div>
                    {expanded && (
                      <div className="border-t border-hairline bg-surface-2/40">
                        <VersementsList
                          contributionId={c.id}
                          membreId={membre.id}
                          membreTelephone={membre.telephone}
                          membrePrenom={membre.prenom}
                          onChange={rechargerFinancier}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Équilibrages appliqués — lecture seule (ADMIN/PRESIDENT/TRESORIERE/COMMISSAIRE). */}
      {equilibrages && equilibrages.length > 0 && (
        <Card className="nk-reveal nk-d5 mt-4 p-6">
          <Overline>{t('membres.detail.equilibragesAppliques')}</Overline>
          <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
            <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-3 border-b border-hairline bg-surface-2/40 px-4 py-2.5 text-2xs font-medium uppercase tracking-[0.12em] text-faint">
              <span>{t('membres.detail.col.plage')}</span>
              <span>{t('membres.detail.col.totalPeriode')}</span>
              <span>{t('membres.detail.col.appliqueLe')}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {equilibrages.map((eq) => (
                <li
                  key={eq.id}
                  className="grid grid-cols-[1fr_1.3fr_1fr] items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="num font-medium text-foreground">
                    {eq.anneeDebut}–{eq.anneeFin}
                  </span>
                  <span className="num text-muted-foreground">{formatMontant(eq.totalPeriode)}</span>
                  <span className="num text-muted-foreground">{formatDate(eq.dateApplication, DATE_COURTE)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Documents rattachés à la fiche membre (MEMBRE_SIMPLE : sa fiche uniquement, filtré serveur) */}
      <DocumentsSection
        entiteType="MEMBRE"
        entiteId={membre.id}
        canManage={peutGererDocument(user?.role, 'MEMBRE')}
      />

      {/* Désignation du chef — surnom optionnel (réutilise Modal/Field/Input/Button). */}
      <Modal
        open={chefModal === 'designer'}
        onClose={() => setChefModal(null)}
        title={t('membres.chef.modalTitre')}
      >
        <p className="text-sm text-muted-foreground">{t('membres.chef.description')}</p>
        <div className="mt-4">
          <Field label={t('membres.chef.surnomLabel')}>
            <Input
              value={surnom}
              onChange={(e) => setSurnom(e.target.value)}
              maxLength={120}
              placeholder={t('membres.chef.surnomPlaceholder')}
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setChefModal(null)}>
            {t('membres.chef.annuler')}
          </Button>
          <Button icon={Crown} loading={chefSubmitting} onClick={designerChef}>
            {t('membres.chef.confirmerDesignation')}
          </Button>
        </div>
      </Modal>

      {/* Retrait du chef — confirmation. */}
      <Modal
        open={chefModal === 'retirer'}
        onClose={() => setChefModal(null)}
        title={t('membres.chef.retraitTitre')}
      >
        <p className="text-sm text-muted-foreground">
          {t('membres.chef.retraitTexte', { nom: `${membre.nom} ${membre.prenom}` })}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setChefModal(null)}>
            {t('membres.chef.annuler')}
          </Button>
          <Button variant="danger" icon={UserMinus} loading={chefSubmitting} onClick={retirerChef}>
            {t('membres.chef.confirmerRetrait')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default MembreDetailPage
