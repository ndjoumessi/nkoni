import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type {
  RepartitionStatutContribution,
  RepartitionStatutMembre,
} from '@/lib/api'
import { formatNombre } from '@/lib/format'
import { Card, Overline } from '@/components/ui/Card'
import { cn, prefersReducedMotion } from '@/lib/utils'

interface Item {
  key: string
  label: string
  count: number
  bar: string
  dot: string
  /** Lien optionnel : rend la ligne cliquable → liste Membres pré-filtrée. */
  href?: string
}

/** Répartition en barre segmentée + légende chiffrée, lignes cliquables si `href`. */
function Repartition({ titre, items }: { titre: string; items: Item[] }) {
  const total = items.reduce((s, it) => s + it.count, 0)

  // Animation d'entrée (§10) : les segments grandissent de 0 vers leur largeur.
  const [monte, setMonte] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (monte) return
    const id = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(id)
  }, [monte])

  return (
    <Card className="p-5">
      <Overline>{titre}</Overline>

      {total === 0 ? (
        <p className="mt-4 text-sm text-faint">Aucune donnée pour l'instant.</p>
      ) : (
        <>
          <div
            className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
            aria-hidden="true"
          >
            {items.map((it) =>
              it.count > 0 ? (
                <span
                  key={it.key}
                  className={cn(
                    'h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full',
                    it.bar,
                  )}
                  style={{ width: monte ? `${(it.count / total) * 100}%` : '0%' }}
                  title={`${it.label} : ${it.count}`}
                />
              ) : null,
            )}
          </div>

          <ul className="mt-3">
            {items.map((it) => {
              const pct = Math.round((it.count / total) * 100)
              const inner = (
                <>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn('h-2 w-2 rounded-full', it.dot)} aria-hidden="true" />
                    {it.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="num font-semibold text-foreground">
                      {formatNombre(it.count)}
                      <span className="ml-1.5 text-xs font-normal text-faint">{pct}%</span>
                    </span>
                    {it.href && (
                      <ChevronRight
                        className="h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </>
              )
              return (
                <li key={it.key}>
                  {it.href ? (
                    <Link
                      to={it.href}
                      className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2/70"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-0 py-1.5 text-sm">
                      {inner}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

export function StatutContributionRepartition({
  data,
  linkBase = '/membres',
}: {
  data: RepartitionStatutContribution
  linkBase?: string
}) {
  return (
    <Repartition
      titre="Membres par statut de cotisation"
      items={[
        {
          key: 'A_JOUR',
          label: 'À jour',
          count: data.A_JOUR,
          bar: 'bg-jade',
          dot: 'bg-jade',
          href: `${linkBase}?cotisation=A_JOUR`,
        },
        {
          key: 'PARTIEL',
          label: 'Partiel',
          count: data.PARTIEL,
          bar: 'bg-amber',
          dot: 'bg-amber',
          href: `${linkBase}?cotisation=PARTIEL`,
        },
        {
          key: 'NON_A_JOUR',
          label: 'Non à jour',
          count: data.NON_A_JOUR,
          bar: 'bg-terra',
          dot: 'bg-terra',
          href: `${linkBase}?cotisation=NON_A_JOUR`,
        },
      ]}
    />
  )
}

export function StatutMembreRepartition({
  data,
  linkBase = '/membres',
}: {
  data: RepartitionStatutMembre
  linkBase?: string
}) {
  return (
    <Repartition
      titre="Membres par statut"
      items={[
        {
          key: 'ACTIF',
          label: 'Actifs',
          count: data.ACTIF,
          bar: 'bg-info',
          dot: 'bg-info',
          href: `${linkBase}?statut=ACTIF`,
        },
        {
          key: 'INACTIF',
          label: 'Inactifs',
          count: data.INACTIF,
          bar: 'bg-surface-3',
          dot: 'bg-muted-foreground',
          href: `${linkBase}?statut=INACTIF`,
        },
        {
          key: 'DECEDE',
          label: 'Décédés',
          count: data.DECEDE,
          bar: 'bg-faint/40',
          dot: 'bg-faint',
          href: `${linkBase}?statut=DECEDE`,
        },
      ]}
    />
  )
}
