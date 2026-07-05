import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '@/lib/api'
import type { AuthUser, InscriptionInput } from '@/lib/api'
import { AuthContext, type AuthContextValue } from './auth-context'

/**
 * Fournit l'état d'authentification à toute l'app.
 *
 * L'access token est gardé UNIQUEMENT en mémoire React (pas de localStorage, même
 * pour l'access token) → surface d'attaque XSS réduite. La persistance de session
 * entre reloads repose sur le cookie httpOnly du refresh token : au montage, on tente
 * un /auth/refresh silencieux pour récupérer un access token et réhydrater le user.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void (async () => {
      try {
        const { accessToken: token } = await authApi.refresh(controller.signal)
        const me = await authApi.me(token, controller.signal)
        if (active) {
          setAccessToken(token)
          setUser(me)
        }
      } catch {
        // Pas de session valide (cookie absent/expiré) → on reste déconnecté.
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const { accessToken: token, user: connectedUser } = await authApi.login(
        email,
        password,
        rememberMe,
      )
      setAccessToken(token)
      setUser(connectedUser)
      // Retourné pour que l'appelant redirige selon le rôle (SUPER_ADMIN → console plateforme).
      return connectedUser
    },
    [],
  )

  const inscription = useCallback(async (input: InscriptionInput) => {
    // L'inscription connecte directement : même réhydratation que login (token + user).
    const { accessToken: token, user: connectedUser } = await authApi.inscription(input)
    setAccessToken(token)
    setUser(connectedUser)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // On efface l'état local même si l'appel réseau échoue.
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const value: AuthContextValue = {
    user,
    accessToken,
    loading,
    isAuthenticated: user !== null,
    login,
    inscription,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
