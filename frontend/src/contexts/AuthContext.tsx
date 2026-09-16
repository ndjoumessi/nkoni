import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  authApi,
  configurerAuthBridge,
  definirModeDemo,
  ouvrirSessionDemo,
  rafraichirAccessToken,
} from '@/lib/api'
import type { AuthUser, InscriptionInput } from '@/lib/api'
import i18n, { appliquerLangue } from '@/lib/i18n'
import { appliquerDevise } from '@/lib/format'
import { purgerCachesApi, purgerDonneesLocales } from '@/lib/offline-queue'
import { AuthContext, type AuthContextValue } from './auth-context'

/** Expiration (epoch secondes) encodée dans un access token JWT, ou null si indéchiffrable. */
function expirationAccessToken(token: string): number | null {
  const partie = token.split('.')[1]
  if (!partie) return null
  try {
    const b64 = partie.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64 + '==='.slice((b64.length + 3) % 4)
    const payload = JSON.parse(atob(pad)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/** Session RÉELLE lue depuis le cookie refresh (montage, retour de démo), ou null s'il n'y en a pas. */
async function lireSessionReelle(signal?: AbortSignal): Promise<{ token: string; me: AuthUser } | null> {
  try {
    const { accessToken: token } = await authApi.refresh(signal)
    const me = await authApi.me(token, signal)
    return { token, me }
  } catch {
    return null
  }
}

/**
 * Fournit l'état d'authentification à toute l'app.
 *
 * L'access token est gardé UNIQUEMENT en mémoire React (pas de localStorage, même
 * pour l'access token) → surface d'attaque XSS réduite. La persistance de session
 * entre reloads repose sur le cookie httpOnly du refresh token : au montage, on tente
 * un /auth/refresh silencieux pour récupérer un access token et réhydrater le user.
 *
 * MODE DÉMO (spec 2026-09-15 §2.2) : jeton de l'espace de démonstration en mémoire, jamais persisté
 * (un rechargement y met fin). Le cookie refresh d'un administrateur réel connecté dans ce navigateur
 * n'est ni lu ni révoqué pendant la démo : sortir de la démo n'appelle JAMAIS /auth/logout, puis
 * réhydrate la session réelle.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modeDemo, setModeDemo] = useState(false)
  // Lu par les callbacks du pont HTTP et par la réhydratation asynchrone (hors cycle de rendu).
  const modeDemoRef = useRef(false)
  // Revue (concurrence) : le refresh de MONTAGE tant qu'il est en vol, pour qu'une sortie de démo
  // déclenchée pendant l'hydratation le RÉUTILISE au lieu d'en relancer un second (cf. sortieEnCoursRef).
  const hydratationEnCoursRef = useRef<Promise<{ token: string; me: AuthUser } | null> | null>(null)
  // Revue (concurrence) : sortie de démo EN VOL, partagée par tout appelant concurrent (double clic sur
  // « Quitter la démo », ou « Se déconnecter » pendant qu'un renouvellement démo échoue en parallèle) —
  // sans ce verrou, un second /auth/refresh présenterait un `jti` déjà tourné par le premier et la
  // détection de réutilisation du serveur révoquerait TOUTE la famille de l'administrateur réel
  // (backend/src/routes/auth.route.ts, réutilisation d'un refresh token déjà tourné).
  const sortieEnCoursRef = useRef<Promise<AuthUser | null> | null>(null)

  const appliquerSession = useCallback((token: string, u: AuthUser) => {
    setAccessToken(token)
    setUser(u)
    // §4 : la préférence serveur prime sur le localStorage dès la réhydratation.
    if (u.langue) appliquerLangue(u.langue)
    // §5/F6 : devise de l'org → formatage des montants dès la réhydratation.
    if (u.devise) appliquerDevise(u.devise)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    // Gardée dans un ref le temps du vol : une sortie de démo déclenchée AVANT la fin de cette
    // hydratation réutilise ce MÊME refresh au lieu d'en relancer un second (cf. quitterDemo).
    const promesse = lireSessionReelle(controller.signal)
    hydratationEnCoursRef.current = promesse

    void (async () => {
      const session = await promesse
      if (hydratationEnCoursRef.current === promesse) hydratationEnCoursRef.current = null
      // Une démo ouverte PENDANT la réhydratation garde la main : la session réelle reviendra à la
      // sortie de la démo, elle n'écrase pas le jeton démo maintenant.
      if (active && session && !modeDemoRef.current) appliquerSession(session.token, session.me)
      if (active) setLoading(false)
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [appliquerSession])

  const quitterDemo = useCallback((): Promise<AuthUser | null> => {
    // Single-flight (revue, concurrence) : une sortie DÉJÀ en vol est renvoyée telle quelle à tout
    // appelant concurrent — jamais un second /auth/refresh pour la même sortie.
    if (sortieEnCoursRef.current) return sortieEnCoursRef.current

    const executerSortie = async (): Promise<AuthUser | null> => {
      // JAMAIS authApi.logout() ni purgerDonneesLocales() ici : le cookie et la file hors-ligne
      // appartiennent à l'administrateur réel éventuel (invariant de revue, test dédié).
      modeDemoRef.current = false
      definirModeDemo(null)
      setModeDemo(false)
      setAccessToken(null)
      setUser(null)
      setLoading(true)
      appliquerDevise('FCFA')
      void purgerCachesApi()
      // Une hydratation de montage encore en vol PARTAGE son refresh : jamais un second en parallèle.
      const session = hydratationEnCoursRef.current
        ? await hydratationEnCoursRef.current
        : await lireSessionReelle()
      // Revue : une démo RÉENTRÉE pendant ce refresh (l'appelant a redémarré la démo avant que la
      // session réelle revienne) garde la main — ne jamais écraser son état avec la session réelle.
      if (!modeDemoRef.current) {
        if (session) appliquerSession(session.token, session.me)
      }
      setLoading(false)
      return modeDemoRef.current ? null : (session?.me ?? null)
    }

    const promesseSortie = executerSortie().finally(() => {
      if (sortieEnCoursRef.current === promesseSortie) sortieEnCoursRef.current = null
    })
    sortieEnCoursRef.current = promesseSortie
    return promesseSortie
  }, [appliquerSession])

  const demarrerDemo = useCallback(async (): Promise<AuthUser> => {
    const { accessToken: token } = await ouvrirSessionDemo()
    // Mode posé AVANT toute requête authentifiée : un 401 renouvelle alors le jeton démo, jamais la
    // session réelle (refresh-on-401 et minuteur proactif la restaureraient depuis le cookie).
    modeDemoRef.current = true
    definirModeDemo({ messageRefus: () => i18n.t('demo.lectureSeule') })
    try {
      // /auth/me (GET, autorisé) porte `membreId` (le président fictif), absent de /demo/session.
      const me = await authApi.me(token)
      setModeDemo(true)
      setAccessToken(token)
      setUser(me)
      // Langue : celle du visiteur est conservée (l'interface le suit, le contenu fictif est en français).
      if (me.devise) appliquerDevise(me.devise)
      void purgerCachesApi()
      return me
    } catch (e) {
      modeDemoRef.current = false
      definirModeDemo(null)
      throw e
    }
  }, [])

  // Pont client HTTP → AuthContext. Le client (`lib/api`) rafraîchit le token sur 401 et propage
  // le nouveau ici (setState) ; si le refresh échoue, il déclenche une déconnexion propre — on vide
  // la session et ProtectedRoute redirige alors vers /login (pas de boucle de retry). En démo, un
  // renouvellement impossible fait SORTIR de la démo (retour à la session réelle éventuelle).
  useEffect(() => {
    configurerAuthBridge({
      onTokenRefreshed: (token) => setAccessToken(token),
      onSessionExpired: () => {
        // `sortieEnCoursRef` : une sortie de démo peut déjà avoir mis `modeDemoRef` à false sans
        // avoir terminé (revue, concurrence) — router quand même vers la sortie PARTAGÉE plutôt que
        // de traiter ça comme une session réelle expirée.
        if (modeDemoRef.current || sortieEnCoursRef.current) {
          void quitterDemo()
          return
        }
        setAccessToken(null)
        setUser(null)
        appliquerDevise('FCFA')
      },
    })
  }, [quitterDemo])

  // Refresh PROACTIF : programmé ~60 s avant l'expiration de l'access token (TTL 15 min côté back)
  // → la session est renouvelée AVANT qu'une requête ne tombe en 401. Réarmé à chaque nouveau token
  // (le succès met à jour `accessToken`, ce qui relance cet effet avec la nouvelle échéance). Un
  // échec proactif ne force pas la déconnexion : le refresh-on-401 réactif prendra le relais.
  // Coupé en démo (§2.2) : le jeton démo est renouvelé à la demande, sur 401.
  useEffect(() => {
    if (!accessToken || modeDemo) return
    const exp = expirationAccessToken(accessToken)
    if (!exp) return
    const delaiMs = exp * 1000 - Date.now() - 60_000
    const id = window.setTimeout(() => {
      void rafraichirAccessToken()
    }, Math.max(0, delaiMs))
    return () => window.clearTimeout(id)
  }, [accessToken, modeDemo])

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
      if (!accessToken || modeDemoRef.current) {
        // Non connecté (sélecteur public) ou démo (compte partagé, lecture seule) : application
        // locale, sans persistance serveur.
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
    // `sortieEnCoursRef` : une sortie de démo concurrente (double appel) peut déjà avoir mis
    // `modeDemoRef` à false sans avoir terminé — router quand même vers la sortie PARTAGÉE, jamais
    // vers /auth/logout qui révoquerait la famille de refresh de l'administrateur réel.
    if (modeDemoRef.current || sortieEnCoursRef.current) {
      // « Se déconnecter » pendant la démo = quitter la démo. /auth/logout révoquerait la famille de
      // refresh de l'administrateur réel connecté dans ce navigateur.
      await quitterDemo()
      return
    }
    try {
      await authApi.logout()
    } catch {
      // On efface l'état local même si l'appel réseau échoue.
    }
    setAccessToken(null)
    setUser(null)
    // Repli sur la devise par défaut : le prochain login réappliquera celle de son org.
    appliquerDevise('FCFA')
    // Poste partagé : purge la file offline + les caches SW GET du tenant qui se déconnecte.
    void purgerDonneesLocales()
  }, [quitterDemo])

  const value: AuthContextValue = {
    user,
    accessToken,
    loading,
    isAuthenticated: user !== null,
    login,
    inscription,
    logout,
    changerLangue,
    modeDemo,
    demarrerDemo,
    quitterDemo,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
