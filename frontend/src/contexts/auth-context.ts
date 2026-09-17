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
  /** Change la préférence de langue perso (§4) : persiste côté serveur et applique à l'UI. */
  changerLangue: (langue: 'FR' | 'EN') => Promise<void>
  /** Session de l'espace de démonstration en cours (spec 2026-09-15 §2.2), non persistée. */
  modeDemo: boolean
  /** Ouvre la démo (POST /demo/session) ; lève l'ApiError reçue (404 = démo indisponible). */
  demarrerDemo: () => Promise<AuthUser>
  /**
   * Quitte la démo SANS jamais appeler /auth/logout, puis réhydrate la session réelle depuis le
   * cookie : renvoie l'utilisateur réel retrouvé, ou null (visiteur sans compte).
   */
  quitterDemo: () => Promise<AuthUser | null>
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
