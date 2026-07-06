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
import { useTranslation } from 'react-i18next'
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

const STATUT_TONE: Record<StatutContribution, BadgeProps['tone']> = {
  A_JOUR: 'jade',
  PARTIEL: 'amber',
  NON_A_JOUR: 'terra',
}

function AlerteBareme({ annee }: { annee: number }) {
  const { t } = useTranslation()
  return (
    <Card className="flex items-start gap-3 border-amber/30 bg-amber/[0.07] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
      <p className="text-sm text-foreground/85">
        {t('dashboard.alerteBareme.avant')}{' '}
        <span className="font-semibold text-amber">{annee}</span>{' '}
        {t('dashboard.alerteBareme.apres')}
      </p>
    </Card>
  )
}

/** Onboarding : dashboard sans aucune donnée financière → on oriente vers le barème. */
function OnboardingVide({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={Sparkles}
      title={t('dashboard.onboarding.titre')}
      className="min-h-[56vh] justify-center"
      description={
        canManage
          ? t('dashboard.onboarding.descriptionGestion')
          : t('dashboard.onboarding.descriptionLecture')
      }
      action={
        canManage && (
          <ButtonLink to="/bareme" icon={CalendarRange}>
            {t('dashboard.onboarding.action')}
          </ButtonLink>
        )
      }
      tips={[
        { icon: CalendarRange, label: t('dashboard.onboarding.tips.bareme') },
        { icon: Users, label: t('dashboard.onboarding.tips.membres') },
        { icon: Coins, label: t('dashboard.onboarding.tips.versements') },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Vues                                                                       */
/* -------------------------------------------------------------------------- */

function VueComplet({ d, canManage }: { d: DashboardComplet; canManage: boolean }) {
  const { t } = useTranslation()
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
              label={t('dashboard.stat.membresAJour')}
              value={formatNombre(d.membresParStatutContribution.A_JOUR)}
              icon={ShieldCheck}
              tone="jade"
            />
            <StatCard
              label={t('dashboard.stat.membresActifs')}
              value={formatNombre(d.membresParStatutMembre.ACTIF)}
              icon={Users}
            />
            <StatCard
              label={t('dashboard.stat.branches')}
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
  // Aucune chaîne en dur ici : les libellés viennent des composants enfants.
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
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t('dashboard.stat.branches')} value={formatNombre(d.nombreBranches)} icon={GitBranch} />
        <StatCard
          label={t('dashboard.stat.membresActifs')}
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
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Card variant="feature" className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <Overline>{t('dashboard.perso.overline', { annee: d.anneeCourante })}</Overline>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
            {t('dashboard.perso.statutTitre')}
          </p>
        </div>
        <Badge tone={STATUT_TONE[d.statut]} size="lg" dot>
          {t(`dashboard.statut.${d.statut}`)}
        </Badge>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('dashboard.perso.totalAttendu')}
          value={formatFcfa(d.totalAttenduCumule)}
          icon={Wallet}
        />
        <StatCard
          label={t('dashboard.perso.totalValorise')}
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

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, loading, error } = useDashboard()
  const canManage = peutGererBareme(user?.role)

  return (
    <>
      <PageHeader
        overline={t('dashboard.header.overline')}
        title={t('dashboard.header.titre')}
        description={data ? t(`dashboard.vue.${data.vue}`) : t('dashboard.chargement')}
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
