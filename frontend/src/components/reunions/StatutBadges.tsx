import type { StatutReunion, StatutResolution, TypeReunion } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V1.1 (§5) — statuts réunion / résolution + type, palette Laiton & Jade. */

const REUNION: Record<StatutReunion, { label: string; tone: BadgeProps['tone'] }> = {
  PLANIFIEE: { label: 'Planifiée', tone: 'info' },
  TENUE: { label: 'Tenue', tone: 'jade' },
  ANNULEE: { label: 'Annulée', tone: 'terra' },
}

const RESOLUTION: Record<StatutResolution, { label: string; tone: BadgeProps['tone'] }> = {
  ADOPTEE: { label: 'Adoptée', tone: 'jade' },
  REJETEE: { label: 'Rejetée', tone: 'terra' },
  REPORTEE: { label: 'Reportée', tone: 'amber' },
}

const TYPE: Record<TypeReunion, string> = {
  ORDINAIRE: 'Ordinaire',
  EXTRAORDINAIRE: 'Extraordinaire',
}

export function StatutReunionBadge({
  statut,
  size,
}: {
  statut: StatutReunion
  size?: BadgeProps['size']
}) {
  const s = REUNION[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
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
  const s = RESOLUTION[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
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
  return (
    <Badge tone={type === 'EXTRAORDINAIRE' ? 'brass' : 'neutral'} size={size}>
      {TYPE[type]}
    </Badge>
  )
}

/** Libellés exportés pour les <select>/menus. */
export const STATUT_REUNION_LABELS = REUNION
export const STATUT_RESOLUTION_LABELS = RESOLUTION
export const TYPE_REUNION_LABELS = TYPE
