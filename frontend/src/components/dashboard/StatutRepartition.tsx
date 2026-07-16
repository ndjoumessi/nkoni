import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type {
  RepartitionStatutContribution,
  RepartitionStatutMembre,
} from '@/lib/api'
import { formatNombre } from '@/lib/format'
import { Card, Overline } from '@/components/ui/Card'
import { Donut } from '@/components/ui/Donut'
import { useCountUp } from '@/hooks/useCountUp'
import { cn, prefersReducedMotion } from '@/lib/utils'

interface Item {
  key: string
  label: string
  count: number
  /** Classe de couleur du texte (arc du donut, via currentColor). */
  couleur: string
  dot: string
  /** Lien optionnel : rend la ligne cliquable → liste Membres pré-filtrée. */
  href?: string
}

/** Répartition en donut proportionnel + légende chiffrée, lignes cliquables si `href`. */
function Repartition({ titre, items }: { titre: string; items: Item[] }) {
  const { t } = useTranslation()
  const total = items.reduce((s, it) => s + it.count, 0)

  // Animation d'entrée (§10) : les arcs du donut poussent de 0 vers leur part, et le total central
  // monte en synchronisation (compteur). `total` réel reste la base du calcul des parts du Donut —
  // seul le NOMBRE affiché est animé.
  const [monte, setMonte] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (monte) return
    const id = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(id)
  }, [monte])
  const totalAnime = Math.round(useCountUp(total))

  return (
    <Card className="p-5">
      <Overline>{titre}</Overline>

      {total === 0 ? (
        <p className="mt-4 text-sm text-faint">{t('dashboard.repartition.aucuneDonnee')}</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          <Donut
            total={total}
            monte={monte}
            segments={items.map((it) => ({ cle: it.key, valeur: it.count, couleur: it.couleur }))}
            centre={
              <>
                <span className="num text-2xl font-semibold text-foreground">
                  {formatNombre(totalAnime)}
                </span>
                <span className="mt-1 text-3xs uppercase tracking-[0.12em] text-faint">
                  {t('dashboard.repartition.total')}
                </span>
              </>
            }
          />

          <ul className="w-full flex-1">
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
        </div>
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
  const { t } = useTranslation()
  return (
    <Repartition
      titre={t('dashboard.repartition.cotisationTitre')}
      items={[
        {
          key: 'A_JOUR',
          label: t('dashboard.statut.A_JOUR'),
          count: data.A_JOUR,
          couleur: 'text-jade',
          dot: 'bg-jade',
          href: `${linkBase}?cotisation=A_JOUR`,
        },
        {
          key: 'PARTIEL',
          label: t('dashboard.statut.PARTIEL'),
          count: data.PARTIEL,
          couleur: 'text-amber',
          dot: 'bg-amber',
          href: `${linkBase}?cotisation=PARTIEL`,
        },
        {
          key: 'NON_A_JOUR',
          label: t('dashboard.statut.NON_A_JOUR'),
          count: data.NON_A_JOUR,
          couleur: 'text-terra',
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
  const { t } = useTranslation()
  return (
    <Repartition
      titre={t('dashboard.repartition.membreTitre')}
      items={[
        {
          key: 'ACTIF',
          label: t('dashboard.repartition.membre.ACTIF'),
          count: data.ACTIF,
          couleur: 'text-info',
          dot: 'bg-info',
          href: `${linkBase}?statut=ACTIF`,
        },
        {
          key: 'INACTIF',
          label: t('dashboard.repartition.membre.INACTIF'),
          count: data.INACTIF,
          couleur: 'text-muted-foreground',
          dot: 'bg-muted-foreground',
          href: `${linkBase}?statut=INACTIF`,
        },
        {
          key: 'DECEDE',
          label: t('dashboard.repartition.membre.DECEDE'),
          count: data.DECEDE,
          couleur: 'text-faint',
          dot: 'bg-faint',
          href: `${linkBase}?statut=DECEDE`,
        },
      ]}
    />
  )
}
