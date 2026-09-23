import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { cleI18n } from '@/lib/i18n'

/**
 * CYCLE DE CHARGEMENT D'UNE PAGE — écrit une fois, testé une fois.
 *
 * Il était recopié dans 32 des 44 pages et 8 composants, pour 36 cycles : un `AbortController`,
 * un drapeau `actif` pour ne pas écrire dans un composant démonté, un `setLoading`/`setError` en
 * ouverture, une garde `AbortError` dans le `catch`, un `finally`. Quatre-vingts lignes de mapping
 * d'erreur réparties sur autant de fichiers.
 *
 * **Pourquoi `charger` et `t` passent par une `ref` et non par les dépendances de l'effet** : une
 * fonction fléchée écrite dans le corps d'un composant est recréée à chaque rendu, et `t` change
 * d'identité avec elle. Dans le tableau de dépendances, elles relancent le chargement en boucle —
 * 8 628 appels dans le test de ce module avant correction. Chaque appelant aurait pu envelopper sa
 * fonction dans un `useCallback` : c'est trente-six occasions d'oublier, pour un piège dont le
 * symptôme est une requête en rafale. La `ref` est toujours à jour, et l'effet ne repart que sur
 * les `deps` DÉCLARÉES par l'appelant. Corollaire heureux pour `t` : changer de langue ne recharge
 * plus les données de la page.
 */

export interface OptionsRessource {
  /**
   * Clé i18n du message de repli, quand l'erreur n'est pas une `ApiError`. Défaut
   * `commun.erreurGenerique`. Les pages passaient jusqu'ici par `lib/api::messageErreur`, qui rend
   * des chaînes FRANÇAISES EN DUR (« Impossible de contacter le serveur… ») dans 93 appels : un
   * lecteur anglophone hors réseau lisait du français. Migrer une page ferme ce trou au passage.
   */
  cleErreur?: string
  /**
   * `false` ⇒ on ne charge pas (et on ne reste pas bloqué en « chargement »). Pour les gardes que
   * la page connaît avant la requête : un rôle qui n'y a pas droit, un paramètre d'URL absent.
   * Défaut `true`.
   */
  pret?: boolean
}

export interface Ressource<T> {
  data: T | null
  loading: boolean
  error: string | null
  recharger: () => void
  /** Pour une mise à jour optimiste après une action de la page. */
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

/**
 * Cœur partagé. `jeton` vaut `null` pour une ressource PUBLIQUE ; la distinction est portée par
 * les deux fonctions exportées plus bas, et pas par un drapeau — oublier de passer le jeton est
 * une classe de bug, pas un réglage.
 */
function useCycle<T>(
  jeton: string | null,
  exigeJeton: boolean,
  charger: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: OptionsRessource,
): Ressource<T> {
  const { t } = useTranslation()
  const { cleErreur = 'commun.erreurGenerique', pret = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const chargerRef = useRef(charger)
  chargerRef.current = charger
  const tRef = useRef(t)
  tRef.current = t

  const bloque = !pret || (exigeJeton && !jeton)

  useEffect(() => {
    if (bloque) {
      // Ne PAS laisser la page en « chargement » indéfiniment : une garde de rôle ou un id absent
      // sont des états définitifs, pas une attente.
      if (!pret) setLoading(false)
      return
    }
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const resultat = await chargerRef.current(controller.signal)
        if (actif) setData(resultat)
      } catch (e) {
        // Une requête annulée n'est pas une erreur : c'est l'utilisateur qui a changé d'écran.
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (actif) setError(e instanceof ApiError ? e.message : tRef.current(cleI18n(cleErreur)))
      } finally {
        if (actif) setLoading(false)
      }
    })()

    return () => {
      actif = false
      controller.abort()
    }
    // `charger` et `t` sont délibérément absents (cf. docblock) ; `deps` est le contrat de l'appelant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jeton, bloque, pret, cleErreur, reloadKey, ...deps])

  const recharger = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, recharger, setData }
}

/**
 * Ressource AUTHENTIFIÉE. `charger` reçoit le jeton d'accès et le signal d'annulation ; tant que
 * la session n'a pas de jeton, rien n'est chargé et la page reste en `loading`.
 */
export function useRessource<T>(
  charger: (accessToken: string, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: OptionsRessource = {},
): Ressource<T> {
  const { accessToken } = useAuth()
  return useCycle(
    accessToken ?? null,
    true,
    (signal) => charger(accessToken ?? '', signal),
    deps,
    options,
  )
}

/**
 * Ressource PUBLIQUE — aucune session requise (page de statut, documentation).
 *
 * Fonction SÉPARÉE et non un drapeau : `charger` n'y reçoit pas de jeton, donc on ne peut pas
 * oublier de le transmettre. Un booléen aurait laissé écrire une requête authentifiée sans jeton,
 * qui échoue en 401 à l'exécution seulement.
 */
export function useRessourcePublique<T>(
  charger: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: OptionsRessource = {},
): Ressource<T> {
  return useCycle(null, false, charger, deps, options)
}
