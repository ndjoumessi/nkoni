import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/lib/api'
import { cheminApresConnexion } from '@/lib/roles'
import { ErrorState } from '@/components/ui/ErrorState'
import { ButtonLink } from '@/components/ui/Button'

type Echec = 'indisponible' | 'occupe' | 'erreur'

/**
 * 404 = démo éteinte ou absente (réessayer ne sert à rien) ; 429 = limite de débit de
 * `POST /demo/session` (10/min par IP — derrière le NAT d'un opérateur mobile, des visiteurs distincts
 * partagent une IP) : ce n'est pas un problème de connexion, on invite à réessayer un peu plus tard.
 */
function classerEchec(e: unknown): Echec {
  if (e instanceof ApiError && e.status === 404) return 'indisponible'
  if (e instanceof ApiError && e.status === 429) return 'occupe'
  return 'erreur'
}

const TEXTES_ECHEC = {
  indisponible: { titre: 'demo.page.indisponibleTitre', description: 'demo.page.indisponible' },
  occupe: { titre: 'demo.page.occupeTitre', description: 'demo.page.occupe' },
  erreur: { titre: 'demo.page.erreurTitre', description: 'demo.page.erreur' },
} as const

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
      .catch((e: unknown) => setEchec(classerEchec(e)))
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
              title={t(TEXTES_ECHEC[echec].titre)}
              description={t(TEXTES_ECHEC[echec].description)}
              onRetry={echec === 'indisponible' ? undefined : ouvrir}
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
