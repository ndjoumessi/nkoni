import type {
  RepartitionStatutContribution,
  RepartitionStatutMembre,
} from '@/lib/api'
import { formatNombre } from '@/lib/format'

/**
 * Affiche une répartition (statut de contribution ou statut de membre) en tuiles
 * colorées avec compteur. Réutilisé par les vues COMPLET / FINANCIER / RESTREINT.
 */

interface Item {
  key: string
  label: string
  count: number
  dot: string
}

function Tuiles({ titre, items }: { titre: string; items: Item[] }) {
  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
      <h2 className="text-xs uppercase tracking-wider text-white/40">{titre}</h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {items.map((it) => (
          <div
            key={it.key}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center"
          >
            <span className={`mx-auto block h-2 w-2 rounded-full ${it.dot}`} aria-hidden="true" />
            <p className="mt-2 text-xl font-semibold text-white">{formatNombre(it.count)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">{it.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function StatutContributionRepartition({
  data,
}: {
  data: RepartitionStatutContribution
}) {
  return (
    <Tuiles
      titre="Membres par statut de cotisation"
      items={[
        { key: 'A_JOUR', label: 'À jour', count: data.A_JOUR, dot: 'bg-emerald-400' },
        { key: 'PARTIEL', label: 'Partiel', count: data.PARTIEL, dot: 'bg-amber-400' },
        { key: 'NON_A_JOUR', label: 'Non à jour', count: data.NON_A_JOUR, dot: 'bg-rose-400' },
      ]}
    />
  )
}

export function StatutMembreRepartition({ data }: { data: RepartitionStatutMembre }) {
  return (
    <Tuiles
      titre="Membres par statut"
      items={[
        { key: 'ACTIF', label: 'Actifs', count: data.ACTIF, dot: 'bg-sky-400' },
        { key: 'INACTIF', label: 'Inactifs', count: data.INACTIF, dot: 'bg-white/40' },
        { key: 'DECEDE', label: 'Décédés', count: data.DECEDE, dot: 'bg-white/20' },
      ]}
    />
  )
}
