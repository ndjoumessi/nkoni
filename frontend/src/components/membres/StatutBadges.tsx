import type { StatutContribution, StatutMembre } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges de statut réutilisés dans la liste et la fiche membre (palette Laiton & Jade). */

const COTISATION: Record<StatutContribution, { label: string; tone: BadgeProps['tone'] }> = {
  A_JOUR: { label: 'À jour', tone: 'jade' },
  PARTIEL: { label: 'Partiel', tone: 'amber' },
  NON_A_JOUR: { label: 'Non à jour', tone: 'terra' },
}

const MEMBRE: Record<StatutMembre, { label: string; tone: BadgeProps['tone'] }> = {
  ACTIF: { label: 'Actif', tone: 'info' },
  INACTIF: { label: 'Inactif', tone: 'neutral' },
  DECEDE: { label: 'Décédé', tone: 'neutral' },
}

export function StatutCotisationBadge({
  statut,
  size,
}: {
  statut: StatutContribution
  size?: BadgeProps['size']
}) {
  const s = COTISATION[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
    </Badge>
  )
}

export function StatutMembreBadge({
  statut,
  size,
}: {
  statut: StatutMembre
  size?: BadgeProps['size']
}) {
  const s = MEMBRE[statut]
  return (
    <Badge tone={s.tone} size={size} dot={statut === 'ACTIF'}>
      {s.label}
    </Badge>
  )
}
