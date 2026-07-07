import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Pencil, Plus, Scale } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  branchesApi,
  contributionsApi,
  equilibragesApi,
  ApiError,
  type Membre,
  type StatutCumule,
  type Contribution,
  type Branche,
  type Equilibrage,
} from '@/lib/api'
import {
  peutGererMembres,
  peutSaisirVersement,
  peutEquilibrer,
  peutGererDocument,
} from '@/lib/roles'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { StatutCotisationBadge, StatutMembreBadge } from '@/components/membres/StatutBadges'
import { VersementsList } from '@/components/VersementsList'
import { formatMontant } from '@/lib/format'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
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

  const [membre, setMembre] = useState<Membre | null>(null)
  const [statut, setStatut] = useState<StatutCumule | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [financierAccessible, setFinancierAccessible] = useState(false)
  const [equilibrages, setEquilibrages] = useState<Equilibrage[] | null>(null)
  const [branches, setBranches] = useState<Branche[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedContrib, setExpandedContrib] = useState<string | null>(null)

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

      try {
        const [s, c] = await Promise.all([
          membresApi.statut(id, accessToken, signal),
          contributionsApi.listByMembre(id, accessToken, signal),
        ])
        if (active) {
          setStatut(s)
          setContributions([...c].sort((a, b) => b.annee - a.annee))
          setFinancierAccessible(true)
        }
      } catch {
        /* pas d'accès au financier (ex. SECRETAIRE) → bloc masqué */
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
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, id, navigate, t])

  const brancheNom = useMemo(() => {
    if (!membre?.brancheId) return '—'
    return branches.find((b) => b.id === membre.brancheId)?.nom ?? '—'
  }, [membre, branches])

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
        <Card className="mt-6 border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
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
            {peutGererMembres(user?.role) && (
              <ButtonLink to={`/membres/${membre.id}/editer`} variant="outline" icon={Pencil}>
                {t('membres.detail.modifier')}
              </ButtonLink>
            )}
          </>
        }
      />

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
          <Info label={t('membres.detail.info.sexe')} value={membre.sexe ?? '—'} />
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
                        <VersementsList contributionId={c.id} membreId={membre.id} />
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
            <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-3 border-b border-hairline bg-surface-2/40 px-4 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-faint">
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
    </div>
  )
}

export default MembreDetailPage
