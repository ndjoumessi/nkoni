import { useTranslation } from 'react-i18next'
import type { StatutContribution, StatutMembre } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges de statut réutilisés dans la liste et la fiche membre (palette Laiton & Jade). */

const COTISATION_TONE: Record<StatutContribution, BadgeProps['tone']> = {
  A_JOUR: 'jade',
  PARTIEL: 'amber',
  NON_A_JOUR: 'terra',
}

const MEMBRE_TONE: Record<StatutMembre, BadgeProps['tone']> = {
  ACTIF: 'info',
  INACTIF: 'neutral',
  DECEDE: 'neutral',
}

export function StatutCotisationBadge({
  statut,
  size,
}: {
  statut: StatutContribution
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  return (
    <Badge tone={COTISATION_TONE[statut]} size={size} dot>
      {t(`membres.badge.cotisation.${statut}`)}
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
  const { t } = useTranslation()
  return (
    <Badge tone={MEMBRE_TONE[statut]} size={size} dot={statut === 'ACTIF'}>
      {t(`membres.badge.membre.${statut}`)}
    </Badge>
  )
}
