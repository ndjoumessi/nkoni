import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/lib/api'
import { cheminApresConnexion } from '@/lib/roles'
import { ErrorState } from '@/components/ui/ErrorState'
import { ButtonLink } from '@/components/ui/Button'

type Echec = 'indisponible' | 'erreur'

/**
 * `/demo` (public, spec 2026-09-15 §2.1) — unique porte d'entrée de l'espace de démonstration côté
 * front : ouvre la session démo puis mène au tableau de bord. Les liens d'entrée restent visibles
 * même démo éteinte ; c'est cette page qui explique l'indisponibilité (aucun appel sur la landing).
 */
export function DemoPage() {
  const { t } = useTranslation()
  const { loading, demarrerDemo } = useAuth()
  const navigate = useNavigate()
  const [echec, setEchec] = useState<Echec | null>(null)
  // StrictMode rejoue les effets en dev : une seule ouverture par tentative.
  const lance = useRef(false)

  const ouvrir = useCallback(() => {
    setEchec(null)
    demarrerDemo()
      .then((u) => navigate(cheminApresConnexion(u.role), { replace: true }))
      .catch((e: unknown) => setEchec(e instanceof ApiError && e.status === 404 ? 'indisponible' : 'erreur'))
  }, [demarrerDemo, navigate])

  useEffect(() => {
    // Attendre la réhydratation de la session réelle : elle ne doit pas se terminer APRÈS la démo.
    if (loading || lance.current) return
    lance.current = true
    ouvrir()
  }, [loading, ouvrir])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        {echec === null ? (
          <p role="status" className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-brass" aria-hidden="true" />
            {t('demo.page.ouverture')}
          </p>
        ) : (
          <>
            <ErrorState
              title={t(echec === 'indisponible' ? 'demo.page.indisponibleTitre' : 'demo.page.erreurTitre')}
              description={t(echec === 'indisponible' ? 'demo.page.indisponible' : 'demo.page.erreur')}
              onRetry={echec === 'erreur' ? ouvrir : undefined}
              retryLabel={t('commun.actions.reessayer')}
            />
            <div className="mt-6 text-center">
              <ButtonLink to="/" variant="outline" icon={ArrowLeft}>
                {t('commun.actions.retourAccueil')}
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default DemoPage
