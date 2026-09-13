import { useTranslation } from 'react-i18next'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import type { EtatForfait } from '@/lib/forfait'
import { formatDateApp } from '@/lib/utils'

/** Teinte par état (jetons du design system). */
const TON: Record<EtatForfait, BadgeProps['tone']> = {
  SANS_ECHEANCE: 'neutral',
  ACTIF: 'jade',
  ECHEANCE_PROCHE: 'amber',
  GRACE: 'amber',
  EXPIRE: 'terra',
}

const DATE_COURTE = { day: 'numeric', month: 'short', year: 'numeric' } as const

interface Props {
  /** `null`/`undefined` (front déployé AVANT le backend, B2 : ancienne API sans ce champ) → neutre. */
  etat: EtatForfait | null | undefined
  joursRestants: number | null | undefined
  expireLe: string | null | undefined
  /** Masque la date quand le contexte l'énonce déjà (phrase de Paramètres). */
  masquerDate?: boolean
}

/**
 * Échéance d'un forfait : date + badge d'état (spec 1.1 §4.2). Affiche les valeurs CALCULÉES par le
 * serveur (`etatForfait`, `joursRestants`), sans les recalculer.
 */
export function BadgeEcheance({ etat, joursRestants, expireLe, masquerDate = false }: Props) {
  const { t } = useTranslation()
  if (etat == null || etat === 'SANS_ECHEANCE' || expireLe == null || joursRestants == null) {
    return <span className="text-faint">{t('commun.echeance.sans')}</span>
  }
  const libelle =
    etat === 'ACTIF'
      ? t('commun.echeance.actif')
      : etat === 'ECHEANCE_PROCHE'
        ? t('commun.echeance.proche', { count: joursRestants })
        : etat === 'GRACE'
          ? t('commun.echeance.grace', { count: -joursRestants })
          : t('commun.echeance.expire')
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      {!masquerDate && <span className="text-sm text-muted-foreground">{formatDateApp(expireLe, DATE_COURTE)}</span>}
      <Badge tone={TON[etat]} size="sm">
        {libelle}
      </Badge>
    </span>
  )
}
