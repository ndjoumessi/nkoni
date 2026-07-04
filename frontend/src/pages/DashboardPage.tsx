import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Coins,
  GitBranch,
  Loader2,
  LogOut,
  Users,
  Wallet,
} from 'lucide-react'
import { estMembreSimple } from '@/lib/roles'
import { useAuth } from '@/contexts/auth-context'
import { useDashboard } from '@/hooks/useDashboard'
import { StatCard } from '@/components/dashboard/StatCard'
import {
  StatutContributionRepartition,
  StatutMembreRepartition,
} from '@/components/dashboard/StatutRepartition'
import { ExportButtons } from '@/components/dashboard/ExportButtons'
import { formatFcfa, formatNombre, formatPourcent } from '@/lib/format'
import type {
  Dashboard,
  DashboardComplet,
  DashboardFinancier,
  DashboardPerso,
  DashboardRestreint,
  StatutContribution,
} from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Petits blocs de présentation                                              */
/* -------------------------------------------------------------------------- */

function RecouvrementBar({ taux }: { taux: number }) {
  const largeur = Math.max(0, Math.min(100, taux))
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wider text-white/40">Taux de recouvrement</h2>
        <span className="text-lg font-semibold text-white">{formatPourcent(taux)}</span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400"
          style={{ width: `${largeur}%` }}
        />
      </div>
    </div>
  )
}

const STATUT_LABEL: Record<StatutContribution, string> = {
  A_JOUR: 'À jour',
  PARTIEL: 'Partiel',
  NON_A_JOUR: 'Non à jour',
}
const STATUT_STYLE: Record<StatutContribution, string> = {
  A_JOUR: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  PARTIEL: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  NON_A_JOUR: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}

function StatutPill({ statut }: { statut: StatutContribution }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold ${STATUT_STYLE[statut]}`}
    >
      {STATUT_LABEL[statut]}
    </span>
  )
}

function AlerteBareme({ annee }: { annee: number }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="text-sm">
        Le barème de l’année <span className="font-semibold">{annee}</span> n’est pas encore
        configuré. Les statuts affichés ignorent cette année tant qu’aucun montant attendu
        n’est défini.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Vues                                                                       */
/* -------------------------------------------------------------------------- */

function VueComplet({ d }: { d: DashboardComplet }) {
  return (
    <div className="space-y-4">
      {d.alertes.baremeAnneeCouranteManquant && <AlerteBareme annee={d.anneeCourante} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total attendu" value={formatFcfa(d.finances.totalAttenduCumule)} icon={Wallet} />
        <StatCard label="Total collecté" value={formatFcfa(d.finances.totalCollecteCumule)} icon={Coins} />
        <StatCard label="Branches familiales" value={formatNombre(d.nombreBranches)} icon={GitBranch} />
        <StatCard label="Membres actifs" value={formatNombre(d.membresParStatutMembre.ACTIF)} icon={Users} />
      </div>
      <RecouvrementBar taux={d.finances.tauxRecouvrement} />
      <div className="grid gap-4 lg:grid-cols-2">
        <StatutContributionRepartition data={d.membresParStatutContribution} />
        <StatutMembreRepartition data={d.membresParStatutMembre} />
      </div>
      <ExportButtons />
    </div>
  )
}

function VueFinancier({ d }: { d: DashboardFinancier }) {
  return (
    <div className="space-y-4">
      {d.alertes.baremeAnneeCouranteManquant && <AlerteBareme annee={d.anneeCourante} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total attendu" value={formatFcfa(d.finances.totalAttenduCumule)} icon={Wallet} />
        <StatCard label="Total collecté" value={formatFcfa(d.finances.totalCollecteCumule)} icon={Coins} />
      </div>
      <RecouvrementBar taux={d.finances.tauxRecouvrement} />
      <StatutContributionRepartition data={d.membresParStatutContribution} />
      <ExportButtons />
    </div>
  )
}

function VueRestreint({ d }: { d: DashboardRestreint }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Branches familiales" value={formatNombre(d.nombreBranches)} icon={GitBranch} />
        <StatCard label="Membres actifs" value={formatNombre(d.membresParStatutMembre.ACTIF)} icon={Users} />
      </div>
      <StatutMembreRepartition data={d.membresParStatutMembre} />
    </div>
  )
}

function VuePerso({ d }: { d: DashboardPerso }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-white/40">
            Ma situation ({d.anneeCourante})
          </h2>
          <StatutPill statut={d.statut} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total attendu (cumulé)" value={formatFcfa(d.totalAttenduCumule)} icon={Wallet} />
        <StatCard label="Total versé / valorisé (cumulé)" value={formatFcfa(d.totalValoriseCumule)} icon={Coins} />
      </div>
    </div>
  )
}

function DashboardContent({ data }: { data: Dashboard }) {
  switch (data.vue) {
    case 'COMPLET':
      return <VueComplet d={data} />
    case 'FINANCIER':
      return <VueFinancier d={data} />
    case 'RESTREINT':
      return <VueRestreint d={data} />
    case 'PERSO':
      return <VuePerso d={data} />
  }
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error } = useDashboard()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wider text-white/40">Tableau de bord</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                {user?.email}
              </span>
            </h1>
            <p className="mt-1 text-sm text-white/50">
              {user?.role}
              {data && ` · ${VUE_LABEL[data.vue]}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/membres"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              {estMembreSimple(user?.role) ? 'Ma fiche' : 'Membres'}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </header>

        <div className="mt-8">
          {loading && (
            <div className="flex items-center justify-center py-20 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-rose-200">
              {error}
            </div>
          )}

          {!loading && !error && data && <DashboardContent data={data} />}
        </div>
      </div>
    </main>
  )
}

export default DashboardPage
