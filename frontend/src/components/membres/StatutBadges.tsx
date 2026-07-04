import type { StatutContribution, StatutMembre } from '@/lib/api'

/** Badges de statut réutilisés dans la liste et la fiche membre. */

const COTISATION: Record<StatutContribution, { label: string; cls: string }> = {
  A_JOUR: { label: 'À jour', cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
  PARTIEL: { label: 'Partiel', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  NON_A_JOUR: { label: 'Non à jour', cls: 'border-rose-400/30 bg-rose-400/10 text-rose-200' },
}

const MEMBRE: Record<StatutMembre, { label: string; cls: string }> = {
  ACTIF: { label: 'Actif', cls: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
  INACTIF: { label: 'Inactif', cls: 'border-white/20 bg-white/5 text-white/60' },
  DECEDE: { label: 'Décédé', cls: 'border-white/15 bg-white/[0.03] text-white/45' },
}

const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium'

export function StatutCotisationBadge({ statut }: { statut: StatutContribution }) {
  const s = COTISATION[statut]
  return <span className={`${base} ${s.cls}`}>{s.label}</span>
}

export function StatutMembreBadge({ statut }: { statut: StatutMembre }) {
  const s = MEMBRE[statut]
  return <span className={`${base} ${s.cls}`}>{s.label}</span>
}
