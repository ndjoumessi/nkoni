import {
  AlertTriangle,
  CalendarRange,
  Coins,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { peutGererBareme } from '@/lib/roles'
import { useAuth } from '@/contexts/auth-context'
import { useDashboard } from '@/hooks/useDashboard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton, StatCardSkeleton } from '@/components/ui/Skeleton'
import { RecouvrementHero } from '@/components/dashboard/RecouvrementHero'
import {
  StatutContributionRepartition,
  StatutMembreRepartition,
} from '@/components/dashboard/StatutRepartition'
import { AnalyseMembres } from '@/components/dashboard/AnalyseMembres'
import { ExportButtons } from '@/components/dashboard/ExportButtons'
import { formatFcfa, formatNombre } from '@/lib/format'
import type {
  Dashboard,
  DashboardComplet,
  DashboardFinancier,
  DashboardPerso,
  DashboardRestreint,
  StatutContribution,
} from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Petits blocs                                                               */
/* -------------------------------------------------------------------------- */

const STATUT: Record<StatutContribution, { label: string; tone: BadgeProps['tone'] }> = {
  A_JOUR: { label: 'À jour', tone: 'jade' },
  PARTIEL: { label: 'Partiel', tone: 'amber' },
  NON_A_JOUR: { label: 'Non à jour', tone: 'terra' },
}

function AlerteBareme({ annee }: { annee: number }) {
  return (
    <Card className="flex items-start gap-3 border-amber/30 bg-amber/[0.07] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
      <p className="text-sm text-foreground/85">
        Le barème de l'année <span className="font-semibold text-amber">{annee}</span> n'est pas
        encore configuré. Les statuts affichés ignorent cette année tant qu'aucun montant attendu
        n'est défini.
      </p>
    </Card>
  )
}

/** Onboarding : dashboard sans aucune donnée financière → on oriente vers le barème. */
function OnboardingVide({ canManage }: { canManage: boolean }) {
  return (
    <EmptyState
      icon={Sparkles}
      title="Bienvenue sur NKONI"
      className="min-h-[56vh] justify-center"
      description={
        canManage
          ? 'Aucune cotisation n’est encore suivie. Commencez par configurer le barème annuel : il fixe le montant attendu par membre et débloque l’ouverture des années.'
          : 'Aucune cotisation n’est encore suivie. Le barème annuel n’a pas encore été configuré par un administrateur.'
      }
      action={
        canManage && (
          <ButtonLink to="/bareme" icon={CalendarRange}>
            Configurer le premier barème
          </ButtonLink>
        )
      }
      tips={[
        { icon: CalendarRange, label: 'Définir le barème annuel' },
        { icon: Users, label: 'Ajouter les membres' },
        { icon: Coins, label: 'Enregistrer les versements' },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Vues                                                                       */
/* -------------------------------------------------------------------------- */

function VueComplet({ d, canManage }: { d: DashboardComplet; canManage: boolean }) {
  const vide = d.finances.totalAttenduCumule === 0
  return (
    <div className="space-y-4">
      {d.alertes.baremeAnneeCouranteManquant && <AlerteBareme annee={d.anneeCourante} />}
      {vide ? (
        <OnboardingVide canManage={canManage} />
      ) : (
        <>
          <RecouvrementHero
            taux={d.finances.tauxRecouvrement}
            collecte={d.finances.totalCollecteCumule}
            attendu={d.finances.totalAttenduCumule}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Membres à jour"
              value={formatNombre(d.membresParStatutContribution.A_JOUR)}
              icon={ShieldCheck}
              tone="jade"
            />
            <StatCard
              label="Membres actifs"
              value={formatNombre(d.membresParStatutMembre.ACTIF)}
              icon={Users}
            />
            <StatCard
              label="Branches"
              value={formatNombre(d.nombreBranches)}
              icon={GitBranch}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatutContributionRepartition data={d.membresParStatutContribution} />
            <StatutMembreRepartition data={d.membresParStatutMembre} />
          </div>
          <AnalyseMembres />
          <ExportButtons />
        </>
      )}
    </div>
  )
}

function VueFinancier({ d, canManage }: { d: DashboardFinancier; canManage: boolean }) {
  const vide = d.finances.totalAttenduCumule === 0
  return (
    <div className="space-y-4">
      {d.alertes.baremeAnneeCouranteManquant && <AlerteBareme annee={d.anneeCourante} />}
      {vide ? (
        <OnboardingVide canManage={canManage} />
      ) : (
        <>
          <RecouvrementHero
            taux={d.finances.tauxRecouvrement}
            collecte={d.finances.totalCollecteCumule}
            attendu={d.finances.totalAttenduCumule}
          />
          <StatutContributionRepartition data={d.membresParStatutContribution} />
          <AnalyseMembres />
          <ExportButtons />
        </>
      )}
    </div>
  )
}

function VueRestreint({ d }: { d: DashboardRestreint }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Branches" value={formatNombre(d.nombreBranches)} icon={GitBranch} />
        <StatCard
          label="Membres actifs"
          value={formatNombre(d.membresParStatutMembre.ACTIF)}
          icon={Users}
          tone="jade"
        />
      </div>
      <StatutMembreRepartition data={d.membresParStatutMembre} />
    </div>
  )
}

function VuePerso({ d }: { d: DashboardPerso }) {
  const s = STATUT[d.statut]
  return (
    <div className="space-y-4">
      <Card variant="feature" className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <Overline>Ma situation · {d.anneeCourante}</Overline>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
            Statut de cotisation
          </p>
        </div>
        <Badge tone={s.tone} size="lg" dot>
          {s.label}
        </Badge>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total attendu (cumulé)"
          value={formatFcfa(d.totalAttenduCumule)}
          icon={Wallet}
        />
        <StatCard
          label="Total versé / valorisé (cumulé)"
          value={formatFcfa(d.totalValoriseCumule)}
          icon={Coins}
          tone="jade"
        />
      </div>
    </div>
  )
}

function DashboardContent({ data, canManage }: { data: Dashboard; canManage: boolean }) {
  switch (data.vue) {
    case 'COMPLET':
      return <VueComplet d={data} canManage={canManage} />
    case 'FINANCIER':
      return <VueFinancier d={data} canManage={canManage} />
    case 'RESTREINT':
      return <VueRestreint d={data} />
    case 'PERSO':
      return <VuePerso d={data} />
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Card variant="feature" className="p-7">
        <Skeleton className="h-3 w-24" />
        <div className="mt-5 flex flex-col items-center gap-8 sm:flex-row">
          <Skeleton className="h-36 w-36 rounded-full" />
          <div className="w-full flex-1 space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const VUE_LABEL: Record<Dashboard['vue'], string> = {
  COMPLET: 'Vue complète',
  FINANCIER: 'Vue financière',
  RESTREINT: 'Vue restreinte',
  PERSO: 'Ma situation',
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error } = useDashboard()
  const canManage = peutGererBareme(user?.role)

  return (
    <>
      <PageHeader
        overline="Tableau de bord"
        title="Vue d'ensemble"
        description={data ? VUE_LABEL[data.vue] : 'Chargement…'}
      />

      <div className="nk-reveal nk-d2 mt-8">
        {loading && <DashboardSkeleton />}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && data && (
          <DashboardContent data={data} canManage={canManage} />
        )}
      </div>
    </>
  )
}

export default DashboardPage
