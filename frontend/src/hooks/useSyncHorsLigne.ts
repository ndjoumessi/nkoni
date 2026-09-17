import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { compterFile, surChangementFile } from '@/lib/offline-queue'
import { synchroniser } from '@/lib/offline-sync'

/**
 * État réseau + file de synchro (§ PWA). Suit `online`/`offline`, compte les mutations en attente
 * (IndexedDB), et rejoue automatiquement la file au RETOUR du réseau (+ synchro manuelle).
 */
export function useSyncHorsLigne() {
  const { accessToken, modeDemo } = useAuth()
  const [enLigne, setEnLigne] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [nbAttente, setNbAttente] = useState(0)
  const [enCours, setEnCours] = useState(false)

  const rafraichir = useCallback(async () => {
    try {
      setNbAttente(await compterFile())
    } catch {
      /* IndexedDB indisponible (mode privé strict) → ignore */
    }
  }, [])

  const lancer = useCallback(async () => {
    // Démo : jamais de rejeu de la file RÉELLE de ce navigateur avec le jeton démo (§2.2).
    if (!accessToken || modeDemo || !navigator.onLine) return
    setEnCours(true)
    try {
      await synchroniser(accessToken)
    } finally {
      setEnCours(false)
      await rafraichir()
    }
  }, [accessToken, modeDemo, rafraichir])

  useEffect(() => {
    void rafraichir()
    const off = surChangementFile(() => void rafraichir())
    const onOnline = () => {
      setEnLigne(true)
      void lancer()
    }
    const onOffline = () => setEnLigne(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      off()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [rafraichir, lancer])

  return { enLigne, nbAttente, enCours, lancer }
}
