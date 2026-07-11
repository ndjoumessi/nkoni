import { useTranslation } from 'react-i18next'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useSyncHorsLigne } from '@/hooks/useSyncHorsLigne'

/**
 * Indicateur d'état réseau + file de synchro (§ PWA). Masqué quand tout va bien (en ligne, file
 * vide). Sinon affiche « hors ligne » ou « n en attente » et permet une synchro manuelle.
 */
export function IndicateurSync({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { enLigne, nbAttente, enCours, lancer } = useSyncHorsLigne()

  if (enLigne && nbAttente === 0) return null

  const libelle = !enLigne
    ? t('offline.horsLigne')
    : t('offline.enAttente', { count: nbAttente })

  return (
    <button
      type="button"
      onClick={() => void lancer()}
      disabled={enCours || !enLigne}
      aria-label={t('offline.synchroniser')}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        !enLigne
          ? 'border-amber/30 bg-amber/10 text-amber'
          : 'border-brass/30 bg-brass/10 text-brass hover:bg-brass/15'
      } ${className}`}
    >
      {!enLigne ? (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <RefreshCw className={`h-3.5 w-3.5 ${enCours ? 'animate-spin' : ''}`} aria-hidden="true" />
      )}
      <span>{libelle}</span>
      {nbAttente > 0 && (
        <span className="num rounded-full bg-current/15 px-1.5 text-3xs leading-4">{nbAttente}</span>
      )}
    </button>
  )
}

export default IndicateurSync
