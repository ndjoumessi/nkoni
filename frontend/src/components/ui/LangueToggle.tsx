import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { appliquerLangue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Bascule FR/EN pour les pages PUBLIQUES (non authentifiées) — donne à un visiteur un moyen
 * visible de changer la langue avant toute connexion. Persiste en `localStorage` via
 * `appliquerLangue` (aucun compte requis), contrairement au sélecteur de « Mon profil » qui,
 * lui, enregistre la préférence côté serveur (`changerLangue`).
 *
 * Réactif : `useTranslation()` re-render sur l'événement `languageChanged` d'i18next.
 */
export function LangueToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const courante: 'FR' | 'EN' = i18n.language.toLowerCase().startsWith('en') ? 'EN' : 'FR'
  const langues: { code: 'FR' | 'EN'; court: string; label: string }[] = [
    { code: 'FR', court: 'FR', label: t('commun.langue.fr') },
    { code: 'EN', court: 'EN', label: t('commun.langue.en') },
  ]

  return (
    <div
      role="group"
      aria-label={t('commun.langue.selecteur')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-hairline bg-surface-2/60 p-0.5',
        className,
      )}
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
      {langues.map(({ code, court, label }) => {
        const actif = courante === code
        return (
          <button
            key={code}
            type="button"
            onClick={() => appliquerLangue(code)}
            aria-pressed={actif}
            aria-label={label}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass',
              actif ? 'bg-brass text-brass-foreground' : 'text-faint hover:text-foreground',
            )}
          >
            {court}
          </button>
        )
      })}
    </div>
  )
}

export default LangueToggle
