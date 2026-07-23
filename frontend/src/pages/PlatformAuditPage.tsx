import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LogOut, History, Building2, Megaphone } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  platformApi,
  messageErreur,
  type PlatformAuditEntry,
  type ActionPlateforme,
} from '@/lib/api'
import { cleI18n } from '@/lib/i18n'
import { formatDateHeure, cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

const ACTIONS: ActionPlateforme[] = ['CHANGER_FORFAIT', 'SUSPENDRE', 'REACTIVER', 'PURGER', 'EXPORTER']

/** Teinte de badge par action (jetons du design system). */
const TON_ACTION: Record<ActionPlateforme, BadgeProps['tone']> = {
  CHANGER_FORFAIT: 'brass',
  SUSPENDRE: 'terra',
  REACTIVER: 'jade',
  PURGER: 'terra',
  EXPORTER: 'neutral',
}

/** Résumé lisible « avant → après » d'une entrée, selon l'action (les données sont des snapshots JSON). */
function resumeDetails(e: PlatformAuditEntry): string {
  const av = (e.donneesAvant ?? {}) as Record<string, unknown>
  const ap = (e.donneesApres ?? {}) as Record<string, unknown>
  switch (e.action) {
    case 'CHANGER_FORFAIT':
      return `${String(av.forfait ?? '—')} → ${String(ap.forfait ?? '—')}`
    case 'SUSPENDRE':
      return 'actif → suspendu'
    case 'REACTIVER':
      return 'suspendu → actif'
    case 'EXPORTER':
      return typeof ap.nbEnregistrements === 'number' ? `${ap.nbEnregistrements}` : '—'
    case 'PURGER':
      return av.forfait ? `forfait ${String(av.forfait)}` : '—'
    default:
      return '—'
  }
}

/**
 * Vue « Historique plateforme » (SUPER_ADMIN, lecture seule) — journal d'audit des actions sur les
 * organisations clientes. Chargé une fois (réponse bornée côté serveur, `tronque` signalé) puis
 * filtré CÔTÉ CLIENT par action et par organisation ciblée : le sélecteur d'org inclut ainsi même
 * les organisations PURGÉES (leur nom snapshot survit dans le journal), introuvables autrement.
 */
export function PlatformAuditPage() {
  const { t } = useTranslation()
  const { user, accessToken, logout } = useAuth()

  const [entrees, setEntrees] = useState<PlatformAuditEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [tronque, setTronque] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const [filtreAction, setFiltreAction] = useState<ActionPlateforme | 'tous'>('tous')
  const [filtreOrg, setFiltreOrg] = useState<string>('tous')

  const charger = () => {
    if (!accessToken) return
    const controller = new AbortController()
    setErreur(null)
    void platformApi
      .listAudit({}, accessToken, controller.signal)
      .then((r) => {
        setEntrees(r.items)
        setTotal(r.total)
        setTronque(r.tronque)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setErreur(messageErreur(e))
      })
    return () => controller.abort()
  }

  useEffect(charger, [accessToken])

  // Options du sélecteur d'org : orgs DISTINCTES présentes dans le journal (nom snapshot), triées.
  const orgs = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entrees ?? []) map.set(e.organisationCibleId, e.organisationNom)
    return [...map.entries()]
      .map(([id, nom]) => ({ id, nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom))
  }, [entrees])

  const filtrees = useMemo(
    () =>
      (entrees ?? []).filter(
        (e) =>
          (filtreAction === 'tous' || e.action === filtreAction) &&
          (filtreOrg === 'tous' || e.organisationCibleId === filtreOrg),
      ),
    [entrees, filtreAction, filtreOrg],
  )

  const colonnes: Column<PlatformAuditEntry>[] = [
    {
      key: 'date',
      header: t('superAdmin.historique.colonnes.date'),
      cell: (e) => <span className="whitespace-nowrap text-muted-foreground">{formatDateHeure(e.dateAction)}</span>,
    },
    {
      key: 'acteur',
      header: t('superAdmin.historique.colonnes.acteur'),
      cell: (e) => <span className="truncate text-foreground">{e.acteurEmail}</span>,
    },
    {
      key: 'action',
      header: t('superAdmin.historique.colonnes.action'),
      cell: (e) => (
        <Badge tone={TON_ACTION[e.action]} size="sm">
          {t(cleI18n(`superAdmin.historique.actions.${e.action}`))}
        </Badge>
      ),
    },
    {
      key: 'organisation',
      header: t('superAdmin.historique.colonnes.organisation'),
      cell: (e) => <span className="truncate font-medium text-foreground">{e.organisationNom}</span>,
    },
    {
      key: 'details',
      header: t('superAdmin.historique.colonnes.details'),
      cell: (e) => <span className="num text-muted-foreground">{resumeDetails(e)}</span>,
    },
  ]

  const lienNav = (to: string, actif: boolean, libelle: string, Icone: typeof History) => (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        actif ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {libelle}
    </Link>
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <NkoniMark className="h-8 w-8 text-lg" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">NKONI</span>
            <Badge tone="brass" size="sm">
              {t('superAdmin.header.plateforme')}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => void logout()}>
              {t('superAdmin.header.deconnexion')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Navigation console : Organisations ↔ Historique. */}
        <nav className="mb-6 inline-flex rounded-xl border border-hairline bg-surface/60 p-1">
          {lienNav('/super-admin', false, t('superAdmin.header.organisations'), Building2)}
          {lienNav('/super-admin/historique', true, t('superAdmin.header.historique'), History)}
          {lienNav('/super-admin/incident', false, t('superAdmin.header.incident'), Megaphone)}
        </nav>

        <PageHeader
          overline={t('superAdmin.historique.overline')}
          title={t('superAdmin.historique.titre')}
          description={t('superAdmin.historique.description')}
        />

        {erreur ? (
          <div className="mt-7">
            <ErrorState title={t('superAdmin.historique.erreur')} description={erreur} onRetry={charger} />
          </div>
        ) : entrees === null ? (
          <div className="mt-7 overflow-hidden rounded-2xl border border-hairline">
            <RowsSkeleton rows={6} />
          </div>
        ) : (
          <>
            <div className="mt-7 flex flex-wrap items-end gap-4">
              <Field label={t('superAdmin.historique.filtreAction')} className="w-56">
                <Select
                  value={filtreAction}
                  onChange={(ev) => setFiltreAction(ev.target.value as ActionPlateforme | 'tous')}
                >
                  <option value="tous">{t('superAdmin.historique.filtreActionToutes')}</option>
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {t(cleI18n(`superAdmin.historique.actions.${a}`))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('superAdmin.historique.filtreOrg')} className="w-64">
                <Select value={filtreOrg} onChange={(ev) => setFiltreOrg(ev.target.value)}>
                  <option value="tous">{t('superAdmin.historique.filtreOrgToutes')}</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="ml-auto text-sm text-faint">
                {t('superAdmin.historique.resultats', { count: filtrees.length })}
              </p>
            </div>

            {tronque && (
              <p className="mt-3 rounded-lg border border-amber/30 bg-amber/[0.07] px-3 py-2 text-xs text-amber">
                {t('superAdmin.historique.tronque', { limite: entrees.length, total })}
              </p>
            )}

            {filtrees.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  icon={History}
                  title={t('superAdmin.historique.vide.titre')}
                  description={t('superAdmin.historique.vide.description')}
                />
              </div>
            ) : (
              <div className="mt-6">
                <DataTable
                  caption={t('superAdmin.historique.titre')}
                  columns={colonnes}
                  rows={filtrees}
                  rowKey={(e) => e.id}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default PlatformAuditPage
