import type { StatutCommemoration, TypeCommemoration } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V2 — type + statut d'une commémoration/cérémonie. */

const TYPE: Record<TypeCommemoration, { label: string; tone: BadgeProps['tone'] }> = {
  COMMEMORATION: { label: 'Commémoration', tone: 'brass' },
  CEREMONIE: { label: 'Cérémonie', tone: 'jade' },
}

const STATUT: Record<StatutCommemoration, { label: string; tone: BadgeProps['tone'] }> = {
  PLANIFIEE: { label: 'Planifiée', tone: 'info' },
  TENUE: { label: 'Tenue', tone: 'jade' },
  ANNULEE: { label: 'Annulée', tone: 'terra' },
}

export function TypeCommemorationBadge({
  type,
  size,
}: {
  type: TypeCommemoration
  size?: BadgeProps['size']
}) {
  const t = TYPE[type]
  return (
    <Badge tone={t.tone} size={size}>
      {t.label}
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
  const s = STATUT[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
    </Badge>
  )
}

export const TYPE_COMMEMORATION_LABELS = TYPE
export const STATUT_COMMEMORATION_LABELS = STATUT
