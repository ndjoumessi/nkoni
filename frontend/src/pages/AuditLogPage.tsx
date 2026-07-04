import { useEffect, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, Select, Input } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/* Libellés FR + badge par type d'entité auditée. */
const ENTITE_LABELS: Record<string, string> = {
  Membre: 'Membre',
  Contribution: 'Contribution',
  Versement: 'Versement',
  EquilibrageContribution: 'Équilibrage',
  Utilisateur: 'Utilisateur',
  Conflit: 'Conflit',
}
const ENTITES = Object.keys(ENTITE_LABELS)

const ACTION_TONE: Record<ActionAudit, BadgeProps['tone']> = {
  CREATE: 'jade',
  UPDATE: 'amber',
  DELETE: 'terra',
}
const ACTION_LABEL: Record<ActionAudit, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
}

/** Route de détail pour une entité auditée (seules Membre/Conflit ont une fiche dédiée). */
function lienEntite(entiteType: string, entiteId: string): string | null {
  if (entiteType === 'Membre') return `/membres/${entiteId}`
  if (entiteType === 'Conflit') return `/conflits/${entiteId}`
  return null
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Formate une valeur de snapshot pour l'affichage. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Détail lisible d'une entrée : paires clé → valeur, différences surlignées. */
function DiffDetails({ entry }: { entry: AuditEntry }) {
  const { donneesAvant: avant, donneesApres: apres } = entry
  const cles = [...new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})])].sort()

  if (cles.length === 0) {
    return <p className="text-sm text-faint">Aucune donnée capturée.</p>
  }

  const compare = avant !== null && apres !== null // UPDATE

  return (
    <div className="mt-1 space-y-1 rounded-xl border border-hairline bg-surface-2/40 p-3">
      {compare && (
        <div className="mb-1 grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 px-2 text-[0.68rem] uppercase tracking-wide text-faint">
          <span>Champ</span>
          <span>Avant → Après</span>
        </div>
      )}
      {cles.map((cle) => {
        const a = avant?.[cle]
        const b = apres?.[cle]
        const change = compare && fmt(a) !== fmt(b)
        return (
          <div
            key={cle}
            className={cn(
              'grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 rounded-lg px-2 py-1',
              change && 'bg-amber/10',
            )}
          >
            <span className="truncate font-medium text-muted-foreground">{cle}</span>
            <span className="min-w-0 break-words font-mono text-xs">
              {compare ? (
                change ? (
                  <>
                    <span className="text-terra line-through">{fmt(a)}</span>
                    <span className="mx-1 text-faint">→</span>
                    <span className="text-jade">{fmt(b)}</span>
                  </>
                ) : (
                  <span className="text-foreground">{fmt(b)}</span>
                )
              ) : (
                // CREATE (que après) ou DELETE (que avant)
                <span className="text-foreground">{fmt(apres !== null ? b : a)}</span>
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
          {
            page,
            ...(entiteType ? { entiteType } : {}),
            ...(acteurId ? { acteurId } : {}),
            ...(dateDebut ? { dateDebut: `${dateDebut}T00:00:00` } : {}),
            ...(dateFin ? { dateFin: `${dateFin}T23:59:59` } : {}),
          },
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
      header: 'Date',
      width: '11.5rem',
      cell: (e) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDateHeure(e.dateAction)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (e) => (
        <Badge tone={ACTION_TONE[e.action]} size="sm">
          {ACTION_LABEL[e.action]}
        </Badge>
      ),
    },
    {
      key: 'entite',
      header: 'Entité',
      cell: (e) => {
        const lien = lienEntite(e.entiteType, e.entiteId)
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              {ENTITE_LABELS[e.entiteType] ?? e.entiteType}
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
      header: 'Acteur',
      cell: (e) =>
        e.acteur?.email ?? <span className="italic text-faint">système</span>,
    },
  ]

  return (
    <>
      <PageHeader
        overline="Gouvernance"
        title="Journal d’audit"
        description={data ? `${total} entrée${total > 1 ? 's' : ''}` : undefined}
      />

      {/* Filtres */}
      <Card className="nk-reveal nk-d2 mt-7 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type d’entité">
            <Select value={entiteType} onChange={(e) => filtrer(setEntiteType)(e.target.value)}>
              <option value="">Toutes</option>
              {ENTITES.map((t) => (
                <option key={t} value={t}>
                  {ENTITE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Acteur">
            <Select value={acteurId} onChange={(e) => filtrer(setActeurId)(e.target.value)}>
              <option value="">Tous</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Du">
            <Input type="date" value={dateDebut} onChange={(e) => filtrer(setDateDebut)(e.target.value)} />
          </Field>
          <Field label="Au">
            <Input type="date" value={dateFin} onChange={(e) => filtrer(setDateFin)(e.target.value)} />
          </Field>
        </div>
        {filtresActifs && (
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={reinitialiser}>
              Réinitialiser
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
            title="Aucune entrée"
            className="min-h-[35vh] justify-center"
            description={
              filtresActifs
                ? 'Aucune écriture ne correspond à ces filtres.'
                : 'Les écritures tracées apparaîtront ici.'
            }
          />
        )}

        {!loading && !error && data && data.donnees.length > 0 && (
          <Card className="overflow-hidden p-0">
            <DataTable
              caption="Journal d'audit (déplier une ligne pour le détail avant/après)"
              columns={colonnes}
              rows={data.donnees}
              rowKey={(e) => e.id}
              expandable={(e) => <DiffDetails entry={e} />}
            />

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
              <span className="text-xs text-faint">
                Page {data.page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  icon={ChevronLeft}
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={data.page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
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
