import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

/**
 * Protège une route : rend `children` seulement si l'utilisateur est authentifié.
 * - Pendant la restauration de session (loading) → écran de chargement.
 * - Non authentifié → redirection vers /login.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b12] text-white/70">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
