import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, RotateCcw, ScrollText } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  auditLogApi,
  utilisateursApi,
  messageErreur,
  type AuditEntry,
  type AuditPage,
  type ActionAudit,
  type Utilisateur,
} from '@/lib/api'
import { peutVoirAudit } from '@/lib/roles'
import { construireFiltresAudit } from '@/lib/audit-filtres'
import { cn, formatDate, formatDateHeure } from '@/lib/utils'
import { formatMontant } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, Select } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/* Types d'entités auditées (libellés résolus via `audit.entites.*`). */
const ENTITES = [
  'Membre',
  'Contribution',
  'Versement',
  'EquilibrageContribution',
  'Utilisateur',
  'Conflit',
]

const ACTION_TONE: Record<ActionAudit, BadgeProps['tone']> = {
  CREATE: 'jade',
  UPDATE: 'amber',
  DELETE: 'terra',
}

/** Route de détail pour une entité auditée (seules Membre/Conflit ont une fiche dédiée). */
function lienEntite(entiteType: string, entiteId: string): string | null {
  if (entiteType === 'Membre') return `/membres/${entiteId}`
  if (entiteType === 'Conflit') return `/conflits/${entiteId}`
  return null
}


/**
 * Libellé humain d'un champ technique du journal d'audit → clé i18n. On RÉUTILISE les libellés
 * du formulaire membre là où ils existent (nom, prénom, dates…) et on ajoute des clés dédiées
 * `audit.champs.*` pour les autres entités. Un champ absent de cette table retombe sur son nom
 * technique brut (aucun blocage d'affichage).
 */
const CLES_CHAMP: Record<string, string> = {
  // Membre — réutilise les libellés du formulaire membre
  nom: 'membres.form.champ.nom',
  prenom: 'membres.form.champ.prenom',
  sexe: 'membres.form.champ.sexe',
  dateNaissance: 'membres.form.champ.dateNaissance',
  telephone: 'membres.form.champ.telephone',
  adresse: 'membres.form.champ.adresse',
  fonctionSociale: 'membres.form.champ.fonctionSociale',
  anneeAdhesion: 'membres.form.champ.anneeAdhesion',
  statut: 'membres.form.champ.statut',
  anneeFinContribution: 'membres.form.champ.anneeFinContribution',
  chefSousFamilleId: 'membres.form.champ.chefSousFamille',
  brancheId: 'membres.form.champ.brancheFamiliale',
  // Autres entités (Contribution, Versement, Équilibrage, Utilisateur, Conflit) + champs communs
  dateDeces: 'audit.champs.dateDeces',
  compteUtilisateurId: 'audit.champs.compteUtilisateurId',
  membreId: 'audit.champs.membreId',
  annee: 'audit.champs.annee',
  montantAttendu: 'audit.champs.montantAttendu',
  montantVerse: 'audit.champs.montantVerse',
  montantValorise: 'audit.champs.montantValorise',
  contributionId: 'audit.champs.contributionId',
  montant: 'audit.champs.montant',
  dateVersement: 'audit.champs.dateVersement',
  mode: 'audit.champs.mode',
  receptionnaireId: 'audit.champs.receptionnaireId',
  note: 'audit.champs.note',
  anneeDebut: 'audit.champs.anneeDebut',
  anneeFin: 'audit.champs.anneeFin',
  totalPeriode: 'audit.champs.totalPeriode',
  auteurId: 'audit.champs.auteurId',
  dateApplication: 'audit.champs.dateApplication',
  email: 'audit.champs.email',
  role: 'audit.champs.role',
  actif: 'audit.champs.actif',
  langue: 'audit.champs.langue',
  niveauConfidentialite: 'audit.champs.niveauConfidentialite',
  titre: 'audit.champs.titre',
  responsableSuiviId: 'audit.champs.responsableSuiviId',
  dateOuverture: 'audit.champs.dateOuverture',
  dateResolution: 'audit.champs.dateResolution',
  organisationId: 'audit.champs.organisationId',
  createdAt: 'audit.champs.createdAt',
  updatedAt: 'audit.champs.updatedAt',
  dateAction: 'audit.champs.dateAction',
}

/**
 * Formate une valeur de snapshot pour l'affichage :
 *  - null/undefined/'' → « — » (convention de l'app pour une valeur vide) ;
 *  - dates ISO → `formatDate`/`formatDateHeure` (locale-aware) — minuit ⇒ date seule,
 *    heure réelle ⇒ date + heure ;
 *  - objets → JSON ; le reste → tel quel.
 */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') {
    const avecHeure = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(v)
    if (avecHeure) return avecHeure[1] === '00:00' ? formatDate(v) : formatDateHeure(v)
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v)
    return v
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Champs monétaires → rendus dans la devise de l'org (plus lisible qu'un entier brut). */
const CHAMPS_MONTANT = new Set([
  'montant',
  'montantAttendu',
  'montantVerse',
  'montantValorise',
  'totalPeriode',
])

/** Plomberie interne sans valeur d'audit → masquée du détail (bruit). */
const CHAMPS_MASQUES = new Set(['idempotenceKey', 'organisationId'])

/** Formate une valeur selon son champ : devise pour les montants, sinon `fmt` générique. */
function fmtValeur(cle: string, v: unknown): string {
  if (CHAMPS_MONTANT.has(cle) && typeof v === 'number') return formatMontant(v)
  return fmt(v)
}

/** Détail lisible d'une entrée : paires clé → valeur, différences surlignées. */
function DiffDetails({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  const { donneesAvant: avant, donneesApres: apres } = entry
  const cles = [...new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})])]
    .filter((c) => !CHAMPS_MASQUES.has(c))
    .sort()

  if (cles.length === 0) {
    return <p className="text-sm text-faint">{t('audit.diff.aucuneDonnee')}</p>
  }

  const compare = avant !== null && apres !== null // UPDATE

  return (
    <div className="mt-1 space-y-1 rounded-xl border border-hairline bg-surface-2/40 p-3">
      {compare && (
        <div className="mb-1 grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 px-2 text-3xs uppercase tracking-wide text-faint">
          <span>{t('audit.diff.champ')}</span>
          <span>{t('audit.diff.avantApres')}</span>
        </div>
      )}
      {cles.map((cle) => {
        const a = avant?.[cle]
        const b = apres?.[cle]
        const change = compare && fmtValeur(cle, a) !== fmtValeur(cle, b)
        return (
          <div
            key={cle}
            className={cn(
              'grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 rounded-lg px-2 py-1',
              change && 'bg-amber/10',
            )}
          >
            <span className="truncate font-medium text-muted-foreground" title={cle}>
              {CLES_CHAMP[cle] ? t(CLES_CHAMP[cle]) : cle}
            </span>
            <span className="min-w-0 break-words font-mono text-xs">
              {compare ? (
                change ? (
                  <>
                    <span className="text-terra line-through">{fmtValeur(cle, a)}</span>
                    <span className="mx-1 text-faint">→</span>
                    <span className="text-jade">{fmtValeur(cle, b)}</span>
                  </>
                ) : (
                  <span className="text-foreground">{fmtValeur(cle, b)}</span>
                )
              ) : (
                // CREATE (que après) ou DELETE (que avant)
                <span className="text-foreground">{fmtValeur(cle, apres !== null ? b : a)}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Journal d'audit (§5) — consultation ADMIN uniquement. */
export function AuditLogPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()

  const [entiteType, setEntiteType] = useState('')
  const [acteurId, setActeurId] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AuditPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([])

  // Liste des comptes pour le filtre « acteur » (ADMIN a le droit).
  useEffect(() => {
    if (!accessToken || !peutVoirAudit(user?.role)) return
    const controller = new AbortController()
    utilisateursApi
      .list(accessToken, controller.signal)
      .then(setUtilisateurs)
      .catch(() => setUtilisateurs([]))
    return () => controller.abort()
  }, [accessToken, user?.role])

  // Chargement du journal (refetch sur changement de filtre/page).
  useEffect(() => {
    if (!accessToken || !peutVoirAudit(user?.role)) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await auditLogApi.list(
          construireFiltresAudit({ page, entiteType, acteurId, dateDebut, dateFin }),
          accessToken,
          controller.signal,
        )
        if (active) setData(res)
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
  }, [accessToken, user?.role, page, entiteType, acteurId, dateDebut, dateFin])

  if (!peutVoirAudit(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  // Toute modif de filtre revient à la page 1.
  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(1)
  }
  const reinitialiser = () => {
    setEntiteType('')
    setActeurId('')
    setDateDebut('')
    setDateFin('')
    setPage(1)
  }

  const total = data?.total ?? 0
  const limite = data?.limite ?? 50
  const totalPages = Math.max(1, Math.ceil(total / limite))
  const filtresActifs = Boolean(entiteType || acteurId || dateDebut || dateFin)

  const colonnes: Column<AuditEntry>[] = [
    {
      key: 'date',
      header: t('audit.table.date'),
      width: '11.5rem',
      cell: (e) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDateHeure(e.dateAction)}</span>
      ),
    },
    {
      key: 'action',
      header: t('audit.table.action'),
      cell: (e) => (
        <Badge tone={ACTION_TONE[e.action]} size="sm">
          {t(`audit.actions.${e.action}`)}
        </Badge>
      ),
    },
    {
      key: 'entite',
      header: t('audit.table.entite'),
      cell: (e) => {
        const lien = lienEntite(e.entiteType, e.entiteId)
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              {t(`audit.entites.${e.entiteType}`, { defaultValue: e.entiteType })}
            </span>
            {lien ? (
              <Link
                to={lien}
                className="inline-flex items-center gap-1 font-mono text-xs text-brass hover:underline"
              >
                {e.entiteId.slice(0, 8)}…
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : (
              <span className="font-mono text-xs text-faint">{e.entiteId.slice(0, 8)}…</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'acteur',
      header: t('audit.table.acteur'),
      cell: (e) =>
        e.acteur?.email ?? <span className="italic text-faint">{t('audit.table.systeme')}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        overline={t('audit.header.overline')}
        title={t('audit.header.titre')}
        description={data ? t('audit.header.entrees', { count: total }) : undefined}
      />

      {/* Filtres (le popover du DatePicker se rend en portail → aucun risque de recouvrement). */}
      <Card className="nk-reveal nk-d2 mt-7 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('audit.filtres.typeEntite')}>
            <Select value={entiteType} onChange={(e) => filtrer(setEntiteType)(e.target.value)}>
              <option value="">{t('audit.filtres.toutes')}</option>
              {ENTITES.map((type) => (
                <option key={type} value={type}>
                  {t(`audit.entites.${type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('audit.filtres.acteur')}>
            <Select value={acteurId} onChange={(e) => filtrer(setActeurId)(e.target.value)}>
              <option value="">{t('audit.filtres.tous')}</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('audit.filtres.du')}>
            <DatePicker value={dateDebut} onChange={filtrer(setDateDebut)} />
          </Field>
          <Field label={t('audit.filtres.au')}>
            <DatePicker value={dateFin} onChange={filtrer(setDateFin)} />
          </Field>
        </div>
        {filtresActifs && (
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={reinitialiser}>
              {t('audit.filtres.reinitialiser')}
            </Button>
          </div>
        )}
      </Card>

      <div className="nk-reveal nk-d3 mt-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={6} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && data && data.donnees.length === 0 && (
          <EmptyState
            icon={ScrollText}
            title={t('audit.vide.titre')}
            className="min-h-[35vh] justify-center"
            description={
              filtresActifs ? t('audit.vide.avecFiltres') : t('audit.vide.sansFiltres')
            }
          />
        )}

        {!loading && !error && data && data.donnees.length > 0 && (
          <Card className="overflow-hidden p-0">
            <DataTable
              caption={t('audit.table.caption')}
              columns={colonnes}
              rows={data.donnees}
              rowKey={(e) => e.id}
              expandable={(e) => <DiffDetails entry={e} />}
            />

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
              <span className="text-xs text-faint">
                {t('audit.pagination.page', { page: data.page, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  icon={ChevronLeft}
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('audit.pagination.precedent')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={data.page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('audit.pagination.suivant')}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

export default AuditLogPage
