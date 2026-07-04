import type { LucideIcon } from 'lucide-react'

/**
 * Carte statistique glassmorphism (label + valeur, icône optionnelle).
 * Aligne le style sombre du reste de l'app (bordure white/12, fond white/[0.06]).
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: LucideIcon
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-white/40" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/45">{sub}</p>}
    </div>
  )
}

export default StatCard
