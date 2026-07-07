import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '@/lib/api'
import type { AuthUser, InscriptionInput } from '@/lib/api'
import { appliquerLangue } from '@/lib/i18n'
import { appliquerDevise } from '@/lib/format'
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
          // §4 : la préférence serveur prime sur le localStorage dès la réhydratation.
          if (me.langue) appliquerLangue(me.langue)
          // §5/F6 : devise de l'org → formatage des montants dès la réhydratation.
          if (me.devise) appliquerDevise(me.devise)
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
      if (connectedUser.langue) appliquerLangue(connectedUser.langue)
      if (connectedUser.devise) appliquerDevise(connectedUser.devise)
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
    if (connectedUser.langue) appliquerLangue(connectedUser.langue)
    if (connectedUser.devise) appliquerDevise(connectedUser.devise)
  }, [])

  const changerLangue = useCallback(
    async (langue: 'FR' | 'EN') => {
      if (!accessToken) {
        // Non connecté (ex. sélecteur public) : on applique localement, sans persistance serveur.
        appliquerLangue(langue)
        return
      }
      const { accessToken: token, langue: enregistree } = await authApi.setLangue(langue, accessToken)
      // Le PATCH réémet un token portant la nouvelle langue → on remplace le token en mémoire.
      setAccessToken(token)
      setUser((prev) => (prev ? { ...prev, langue: enregistree } : prev))
      appliquerLangue(enregistree)
    },
    [accessToken],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // On efface l'état local même si l'appel réseau échoue.
    }
    setAccessToken(null)
    setUser(null)
    // Repli sur la devise par défaut : le prochain login réappliquera celle de son org.
    appliquerDevise('FCFA')
  }, [])

  const value: AuthContextValue = {
    user,
    accessToken,
    loading,
    isAuthenticated: user !== null,
    login,
    inscription,
    logout,
    changerLangue,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
