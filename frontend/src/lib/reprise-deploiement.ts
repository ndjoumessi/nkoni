import { signaler } from '@/lib/observabilite'

/**
 * REPRISE APRÈS BASCULEMENT DU SERVICE WORKER — défaut vécu en production le 2026-09-27.
 *
 * Le SW est en `registerType: 'autoUpdate'` : au déploiement suivant il s'échange EN SILENCE, et
 * Workbox purge l'ancien précache. Un onglet resté ouvert continue alors de faire tourner l'ancien
 * bundle ; à la première navigation vers une route PARESSEUSE (39 dans l'application), il demande
 * un chunk que le précache n'a plus. L'`import()` échoue, `React.lazy` lève, et l'utilisateur
 * reçoit l'écran « Une erreur inattendue est survenue ».
 *
 * Ce n'est pas un défaut de code applicatif : N'IMPORTE QUEL déploiement le produit. C'est la
 * stratégie de mise à jour qui l'ouvre.
 *
 * Deux remèdes possibles. Passer en `registerType: 'prompt'` — le plus propre sur le fond, mais il
 * change l'expérience (une invite à recharger apparaît à chaque déploiement) et ne supprime pas la
 * fenêtre pour qui ignore l'invite. Ou RATTRAPER l'échec, ce que fait ce module : Vite émet
 * `vite:preloadError` quand un chunk ne se charge pas ; on recharge la page, ce qui réamorce sur
 * le bundle courant. L'utilisateur voit un rechargement au lieu d'un écran d'erreur.
 *
 * ⚠️ Le garde anti-boucle est la pièce à ne pas retirer : si le chunk est VRAIMENT introuvable
 * (déploiement cassé, réseau coupé), recharger sans mémoire boucle à l'infini et rend
 * l'application inutilisable — un remède pire que le mal. D'où le marqueur horodaté.
 */

/** Marqueur anti-boucle. `sessionStorage` : oublié à la fermeture de l'onglet, jamais partagé. */
const CLE_MARQUEUR = 'nk-reprise-chunk'

/** Fenêtre pendant laquelle un second rechargement est refusé. */
export const FENETRE_ANTI_BOUCLE_MS = 30_000

/**
 * Peut-on recharger ? Pure, donc testable — c'est la seule partie où une erreur coûterait cher
 * (boucle de rechargement), et la seule qu'un test puisse atteindre.
 */
export function doitRecharger(
  marqueur: string | null,
  maintenant: number,
  fenetreMs: number = FENETRE_ANTI_BOUCLE_MS,
): boolean {
  if (!marqueur) return true
  const precedent = Number(marqueur)
  // Marqueur illisible (écriture d'une autre version, corruption) : on ne se bloque pas dessus.
  if (!Number.isFinite(precedent)) return true
  return maintenant - precedent > fenetreMs
}

/** Installe le filet. Rend la fonction de retrait (tests, démontage). */
export function installerRepriseDeChunk(
  recharger: () => void = () => window.location.reload(),
): () => void {
  const surEchec = (evenement: Event) => {
    // Sans `preventDefault`, Vite relance l'erreur et l'ErrorBoundary reprend la main — soit
    // exactement l'écran qu'on cherche à éviter.
    evenement.preventDefault()

    let marqueur: string | null = null
    // `sessionStorage` lève en navigation privée stricte ou si le stockage est bloqué.
    try {
      marqueur = sessionStorage.getItem(CLE_MARQUEUR)
    } catch {
      marqueur = null
    }

    if (!doitRecharger(marqueur, Date.now())) {
      // On a DÉJÀ rechargé il y a peu et le chunk manque toujours : ce n'est plus une bascule de
      // SW, c'est une panne. On cesse de recharger et on la rend visible plutôt que muette.
      signaler(new Error('Chunk introuvable après rechargement'), { type: 'vite:preloadError' })
      return
    }

    try {
      sessionStorage.setItem(CLE_MARQUEUR, String(Date.now()))
    } catch {
      // Sans stockage, pas de garde possible : on recharge quand même une fois, l'utilisateur
      // étant bloqué de toute façon. Le risque de boucle existe, mais il est préférable à un
      // écran d'erreur définitif.
    }
    recharger()
  }

  window.addEventListener('vite:preloadError', surEchec)
  return () => window.removeEventListener('vite:preloadError', surEchec)
}
