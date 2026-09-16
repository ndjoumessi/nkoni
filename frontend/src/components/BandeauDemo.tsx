import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Eye, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cheminApresConnexion } from '@/lib/roles'
import { Button } from '@/components/ui/Button'

/**
 * Bandeau de l'espace de démonstration (spec 2026-09-15 §2.3), en tête de `#contenu-principal`,
 * AU-DESSUS du bandeau de forfait. Non fermable : tant que la démo dure, le visiteur doit savoir que
 * les données sont fictives et que rien ne s'enregistre. `role="status"` (information, pas alerte).
 * Sortir passe par `quitterDemo`, qui n'appelle jamais /auth/logout.
 */
export function BandeauDemo() {
  const { t } = useTranslation()
  const { modeDemo, quitterDemo } = useAuth()
  const navigate = useNavigate()
  const [enCours, setEnCours] = useState(false)

  if (!modeDemo) return null

  const quitter = async (destination?: string) => {
    setEnCours(true)
    const reel = await quitterDemo()
    navigate(destination ?? (reel ? cheminApresConnexion(reel.role) : '/'), { replace: true })
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-brass/30 bg-brass/[0.07] p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-brass" aria-hidden="true" />
        <p className="text-sm text-foreground">
          <span className="font-medium">{t('demo.bandeau.titre')}</span>
          {' — '}
          {t('demo.bandeau.texte')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <Button size="sm" disabled={enCours} onClick={() => void quitter('/inscription')}>
          {t('commun.actions.creerMonEspace')}
        </Button>
        <Button size="sm" variant="outline" icon={LogOut} disabled={enCours} onClick={() => void quitter()}>
          {enCours ? t('demo.bandeau.retourEnCours') : t('demo.bandeau.quitter')}
        </Button>
      </div>
    </div>
  )
}
