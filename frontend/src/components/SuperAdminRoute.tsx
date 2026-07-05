import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { estSuperAdmin } from '@/lib/roles'

/**
 * Protège la console PLATEFORME /super-admin (SaaS §2.3) : réservée au rôle transverse
 * SUPER_ADMIN.
 * - Pendant la restauration de session → écran de chargement.
 * - Non authentifié → /login.
 * - Authentifié mais non super-admin (rôle d'organisation) → renvoyé vers son tableau de bord.
 */
export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-brass" aria-label="Chargement" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!estSuperAdmin(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default SuperAdminRoute
