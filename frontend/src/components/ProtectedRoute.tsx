import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { estSuperAdmin } from '@/lib/roles'

/**
 * Protège une route TENANT : rend `children` seulement si l'utilisateur est authentifié.
 * - Pendant la restauration de session (loading) → écran de chargement.
 * - Non authentifié → redirection vers /login.
 * - SUPER_ADMIN (rôle plateforme, sans organisation) → renvoyé vers sa console /super-admin :
 *   les pages tenant (AppShell) n'ont pas de sens pour lui et échoueraient (pas de contexte org).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-brass" aria-label={t('commun.chargement')} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (estSuperAdmin(user?.role)) {
    return <Navigate to="/super-admin" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
