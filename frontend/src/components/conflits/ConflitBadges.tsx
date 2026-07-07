import { useTranslation } from 'react-i18next'
import { Globe, Lock, Users2, type LucideIcon } from 'lucide-react'
import type { NiveauConfidentialite, StatutConflit } from '@/lib/api'
import { Badge, type BadgeProps } from '@/components/ui/Badge'

/** Badges V2 (§4.4) — niveau de confidentialité + statut d'un conflit. */

const NIVEAU_META: Record<NiveauConfidentialite, { tone: BadgeProps['tone']; icon: LucideIcon }> = {
  PUBLIC: { tone: 'info', icon: Globe },
  BUREAU: { tone: 'amber', icon: Users2 },
  CONFIDENTIEL: { tone: 'terra', icon: Lock },
}

const STATUT_META: Record<StatutConflit, { tone: BadgeProps['tone'] }> = {
  OUVERT: { tone: 'info' },
  EN_COURS: { tone: 'amber' },
  RESOLU: { tone: 'jade' },
  CLOS: { tone: 'neutral' },
}

export function NiveauBadge({
  niveau,
  size,
}: {
  niveau: NiveauConfidentialite
  size?: BadgeProps['size']
}) {
  const { t } = useTranslation()
  const n = NIVEAU_META[niveau]
  const Icon = n.icon
  return (
    <Badge tone={n.tone} size={size}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`conflits.niveau.${niveau}`)}
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
  const { t } = useTranslation()
  const s = STATUT_META[statut]
  return (
    <Badge tone={s.tone} size={size} dot>
      {t(`conflits.statut.${statut}`)}
    </Badge>
  )
}
