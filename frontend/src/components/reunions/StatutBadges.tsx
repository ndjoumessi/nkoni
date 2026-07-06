import { useTranslation } from 'react-i18next'
import type { StatutReunion, StatutResolution, TypeReunion } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V1.1 (§5) — statuts réunion / résolution + type, palette Laiton & Jade. */

const REUNION_TONE: Record<StatutReunion, BadgeProps['tone']> = {
  PLANIFIEE: 'info',
  TENUE: 'jade',
  ANNULEE: 'terra',
}

const RESOLUTION_TONE: Record<StatutResolution, BadgeProps['tone']> = {
  ADOPTEE: 'jade',
  REJETEE: 'terra',
  REPORTEE: 'amber',
}

export function StatutReunionBadge({
  statut,
  size,
}: {
  statut: StatutReunion
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  return (
    <Badge tone={REUNION_TONE[statut]} size={size} dot>
      {t(`reunions.statuts.${statut}`)}
    </Badge>
  )
}

export function StatutResolutionBadge({
  statut,
  size,
}: {
  statut: StatutResolution
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  return (
    <Badge tone={RESOLUTION_TONE[statut]} size={size} dot>
      {t(`resolutions.statuts.${statut}`)}
    </Badge>
  )
}

export function TypeReunionBadge({
  type,
  size,
}: {
  type: TypeReunion
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  return (
    <Badge tone={type === 'EXTRAORDINAIRE' ? 'brass' : 'neutral'} size={size}>
      {t(`reunions.types.${type}`)}
    </Badge>
  )
}
