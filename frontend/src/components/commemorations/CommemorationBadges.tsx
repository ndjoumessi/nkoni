import { useTranslation } from 'react-i18next'
import type { StatutCommemoration, TypeCommemoration } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V2 — type + statut d'une commémoration/cérémonie. */

const TYPE_META: Record<TypeCommemoration, { tone: BadgeProps['tone'] }> = {
  COMMEMORATION: { tone: 'brass' },
  CEREMONIE: { tone: 'jade' },
}

const STATUT_META: Record<StatutCommemoration, { tone: BadgeProps['tone'] }> = {
  PLANIFIEE: { tone: 'info' },
  TENUE: { tone: 'jade' },
  ANNULEE: { tone: 'terra' },
}

export function TypeCommemorationBadge({
  type,
  size,
}: {
  type: TypeCommemoration
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  const meta = TYPE_META[type]
  return (
    <Badge tone={meta.tone} size={size}>
      {t(`commemorations.type.${type}`)}
    </Badge>
  )
}

export function StatutCommemorationBadge({
  statut,
  size,
}: {
  statut: StatutCommemoration
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  const s = STATUT_META[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {t(`commemorations.statut.${statut}`)}
    </Badge>
  )
}
