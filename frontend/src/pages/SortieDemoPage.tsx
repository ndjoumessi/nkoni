import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cheminApresConnexion } from '@/lib/roles'
import type { EtatSortieDemo } from '@/lib/demo'

/** N'accepte qu'un chemin INTERNE (jamais `//hote` ni une URL absolue). */
function destinationInterne(etat: unknown): string | undefined {
  const d = (etat as EtatSortieDemo | null)?.destination
  return typeof d === 'string' && d.startsWith('/') && !d.startsWith('//') ? d : undefined
}

/**
 * `/demo/sortie` (public) — UNIQUE chemin de sortie de l'espace de démonstration depuis l'interface.
 *
 * Pourquoi une route et non un appel direct depuis la coquille (revue finale PR 3, C1) : quitter la
 * démo vide la session (`user=null`, `loading=true`) puis la réhydrate. Déclenchée SOUS
 * `ProtectedRoute`, la fin du chargement était rendue AVANT le changement de location (le routeur le
 * pousse dans une transition) → `ProtectedRoute` rendait `<Navigate to="/login">`, dont l'effet
 * écrasait la destination ; et l'ancienne URL démo se remontait sous la vraie session. Ici, la coquille
 * est DÉJÀ démontée quand la session change : rien ne peut rediriger à notre place.
 *
 * La sortie passe par `quitterDemo`, qui n'appelle jamais /auth/logout (invariant).
 */
export function SortieDemoPage() {
  const { t } = useTranslation()
  const { loading, modeDemo, user, quitterDemo } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  // StrictMode rejoue les effets en dev : une seule sortie.
  const lance = useRef(false)

  useEffect(() => {
    // Hors démo, attendre la réhydratation de montage pour connaître la session réelle éventuelle.
    if (lance.current || (loading && !modeDemo)) return
    lance.current = true
    const destination = destinationInterne(state)
    const aller = (reel: { role: string } | null) =>
      navigate(destination ?? (reel ? cheminApresConnexion(reel.role) : '/'), { replace: true })

    if (!modeDemo) {
      // Arrivée directe (rechargement, lien) : rien à quitter, seulement naviguer.
      aller(user)
      return
    }
    quitterDemo()
      .then(aller)
      .catch(() => aller(null))
  }, [loading, modeDemo, user, state, quitterDemo, navigate])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <p role="status" className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-brass" aria-hidden="true" />
        {t('demo.bandeau.retourEnCours')}
      </p>
    </main>
  )
}

export default SortieDemoPage
