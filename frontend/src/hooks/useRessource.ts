import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { cleI18n } from '@/lib/i18n'

/**
 * CYCLE DE CHARGEMENT D'UNE PAGE — écrit une fois, testé une fois.
 *
 * Il était recopié dans 32 des 44 pages : un `AbortController`, un drapeau `actif` pour ne pas
 * écrire dans un composant démonté, un `setLoading`/`setError` en ouverture, une garde
 * `AbortError` dans le `catch` (présente 28 fois, donc ABSENTE parfois — et son absence fait
 * clignoter un message d'erreur quand l'utilisateur quitte la page pendant le chargement), un
 * `finally`. Quatre-vingts lignes de mapping d'erreur réparties sur autant de fichiers.
 *
 * **Pourquoi `charger` passe par une `ref` et non par les dépendances de l'effet** : une fonction
 * fléchée écrite dans le corps de la page est recréée à chaque rendu. La mettre dans le tableau de
 * dépendances relancerait le chargement en boucle. Chaque appelant aurait pu l'envelopper dans un
 * `useCallback` — c'est trente-deux occasions d'oublier, pour un piège dont le symptôme est une
 * requête en rafale. La `ref` est toujours à jour, et l'effet ne repart que sur les `deps`
 * DÉCLARÉES par l'appelant.
 *
 * @param charger  reçoit le jeton d'accès et le signal d'annulation ; rend la donnée.
 * @param deps     ce qui doit relancer le chargement (filtres, id d'URL, page…).
 * @param cleErreur clé i18n du message de repli, quand l'erreur n'est pas une `ApiError`.
 *                  Défaut `commun.erreurGenerique`. Les pages passaient jusqu'ici par
 *                  `messageErreur()`, qui rend des chaînes FRANÇAISES EN DUR (« Impossible de
 *                  contacter le serveur… ») : un lecteur anglophone hors réseau lisait du
 *                  français. Migrer une page vers ce module corrige ce trou au passage.
 */
export function useRessource<T>(
  charger: (accessToken: string, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  cleErreur: string = 'commun.erreurGenerique',
): {
  data: T | null
  loading: boolean
  error: string | null
  recharger: () => void
  /** Pour une mise à jour optimiste après une action de la page. */
  setData: React.Dispatch<React.SetStateAction<T | null>>
} {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const chargerRef = useRef(charger)
  chargerRef.current = charger
  // `t` AUSSI par référence, et pour la même raison que `charger` : son identité n'est pas stable
  // d'un rendu à l'autre. Dans les dépendances, elle relançait le chargement en boucle — défaut
  // trouvé par le test de ce module, pas en production. Accessoirement, c'est plus juste :
  // changer de langue ne doit pas recharger toutes les données de la page.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const resultat = await chargerRef.current(accessToken, controller.signal)
        if (actif) setData(resultat)
      } catch (e) {
        // Une requête annulée n'est pas une erreur : c'est l'utilisateur qui a changé d'écran.
        // Sans cette garde, quitter une page pendant son chargement affiche un message rouge.
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
  }, [accessToken, cleErreur, reloadKey, ...deps])

  const recharger = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, recharger, setData }
}
