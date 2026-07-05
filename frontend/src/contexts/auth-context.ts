import { createContext, useContext } from 'react'
import type { AuthUser, InscriptionInput } from '@/lib/api'

export interface AuthContextValue {
  user: AuthUser | null
  accessToken: string | null
  loading: boolean
  isAuthenticated: boolean
  /** Connecte l'utilisateur et retourne son profil (pour rediriger selon le rôle). */
  login: (email: string, password: string, rememberMe: boolean) => Promise<AuthUser>
  /** Auto-inscription (§3.1) : crée l'organisation + l'admin fondateur et ouvre la session. */
  inscription: (input: InscriptionInput) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** Hook d'accès au contexte d'authentification. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur d’un <AuthProvider>')
  }
  return ctx
}
