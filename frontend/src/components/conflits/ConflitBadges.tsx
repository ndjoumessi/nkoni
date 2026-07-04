import { Globe, Lock, Users2, type LucideIcon } from 'lucide-react'
import type { NiveauConfidentialite, StatutConflit } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V2 (§4.4) — niveau de confidentialité + statut d'un conflit. */

const NIVEAU: Record<
  NiveauConfidentialite,
  { label: string; tone: BadgeProps['tone']; icon: LucideIcon }
> = {
  PUBLIC: { label: 'Public', tone: 'info', icon: Globe },
  BUREAU: { label: 'Bureau', tone: 'amber', icon: Users2 },
  CONFIDENTIEL: { label: 'Confidentiel', tone: 'terra', icon: Lock },
}

const STATUT: Record<StatutConflit, { label: string; tone: BadgeProps['tone'] }> = {
  OUVERT: { label: 'Ouvert', tone: 'info' },
  EN_COURS: { label: 'En cours', tone: 'amber' },
  RESOLU: { label: 'Résolu', tone: 'jade' },
  CLOS: { label: 'Clos', tone: 'neutral' },
}

export function NiveauBadge({
  niveau,
  size,
}: {
  niveau: NiveauConfidentialite
  size?: BadgeProps['size']
}) {
  const n = NIVEAU[niveau]
  const Icon = n.icon
  return (
    <Badge tone={n.tone} size={size}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {n.label}
    </Badge>
  )
}

export function StatutConflitBadge({
  statut,
  size,
}: {
  statut: StatutConflit
  size?: BadgeProps['size']
}) {
  const s = STATUT[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
    </Badge>
  )
}

/** Libellés exportés pour les <select>. */
export const NIVEAU_LABELS = NIVEAU
export const STATUT_CONFLIT_LABELS = STATUT
