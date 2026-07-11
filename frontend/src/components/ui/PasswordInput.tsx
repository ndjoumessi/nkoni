import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './Field'

/**
 * Champ mot de passe avec bouton œil (afficher/masquer) intégré, cohérent avec le
 * design system (s'appuie sur <Input>). Icône gauche optionnelle (ex. Lock, KeyRound).
 *
 * - Le bouton est `type="button"` → il ne soumet jamais le formulaire.
 * - Accessible : aria-label dynamique + aria-pressed, focusable au clavier.
 * - Toujours passer `name` + `autoComplete` (current-password / new-password) au champ
 *   pour que le navigateur propose la sauvegarde / génération du mot de passe.
 */
export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leftIcon?: LucideIcon
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, leftIcon: LeftIcon, ...props }, ref) => {
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        {LeftIcon && (
          <LeftIcon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
        )}
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(LeftIcon && 'pl-10', 'pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('ui.motDePasse.masquer') : t('ui.motDePasse.afficher')}
          aria-pressed={visible}
          // Bouton ABSOLUTE → pas de .tap-target (position:relative le casserait, régression vécue).
          // Cible agrandie à 40px en restant DANS le champ : l'Input réserve pr-11 (44px) à droite,
          // le bouton occupe right-1 (4px) + w-10 (40px) = 44px → aucun débordement, œil quasi en place.
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground focus:outline-none focus-visible:text-brass"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
