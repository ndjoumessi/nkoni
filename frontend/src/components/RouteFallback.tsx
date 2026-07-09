import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Fallback Suspense pour les pages chargées en `lazy()` (code-splitting par route). Reprend le
 * spinner menthe « Menthe & Encre » de `ProtectedRoute` pour une transition cohérente.
 * - `pleinEcran` : pour une page hors `AppShell` (console plateforme) → occupe tout l'écran.
 * - sinon : centré dans la zone de contenu (l'`AppShell` reste affichée pendant le chargement).
 */
export function RouteFallback({ pleinEcran = false }: { pleinEcran?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex items-center justify-center text-muted-foreground',
        pleinEcran ? 'min-h-screen bg-background' : 'min-h-[60vh]',
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin text-brass" aria-label={t('commun.chargement')} />
    </div>
  )
}

export default RouteFallback
