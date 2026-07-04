import { useEffect, useState } from 'react'
import { dashboardApi, ApiError, type Dashboard } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

/**
 * Charge le tableau de bord (GET /dashboard) avec l'access token courant. Le backend
 * renvoie la vue adaptée au rôle ; le typage `Dashboard` est discriminé par `vue`.
 */
export function useDashboard() {
  const { accessToken } = useAuth()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const d = await dashboardApi.get(accessToken, controller.signal)
        if (active) setData(d)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) {
          setError(
            e instanceof ApiError ? e.message : 'Erreur de chargement du tableau de bord.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken])

  return { data, loading, error }
}
