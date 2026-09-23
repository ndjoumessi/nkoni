/**
 * Clé de rate-limit (roadmap 2.4) — À QUI imputer une requête.
 *
 * **Pourquoi pas l'IP seule** (mesuré en production le 2026-09-19, logs HTTP Railway) : le navigateur
 * appelle `nkoni.vercel.app/api/*`, que Vercel relaie vers Railway ; or Railway RÉÉCRIT
 * `X-Forwarded-For` avec l'adresse du pair TCP, c'est-à-dire l'adresse de SORTIE de Vercel. Malgré
 * `trustProxy: true`, `req.ip` vaut donc la même poignée d'adresses pour TOUS les utilisateurs : un
 * seul seau de 300 requêtes/min pour toute la plateforme. Un utilisateur actif consomme 20 à 40
 * requêtes/min (7 appels à l'ouverture, 8 pour une fiche membre) : une dizaine de personnes suffisait
 * à déclencher des 429 pour tout le monde. (Revers de la même réécriture : un `X-Forwarded-For` forgé
 * en appelant Railway en direct n'a AUCUN effet — l'IP n'est pas usurpable.)
 *
 * Règle :
 * - **Requête authentifiée** (jeton d'accès Bearer dont la SIGNATURE est vérifiée) → clé = le compte
 *   (`sub`). Infalsifiable sans le secret JWT : forger un `sub` ne donne aucun seau neuf.
 * - **Route à budget propre** (`config.rateLimit` : login, inscription, démo, webhooks PSP) → clé = IP,
 *   même si un jeton accompagne la requête. Ces budgets protègent contre la force brute et le coût
 *   d'argon2 ; les imputer à un compte permettrait de les multiplier avec plusieurs comptes.
 * - **Jeton de démonstration** → IP : tous les visiteurs partagent le même compte démo, une clé par
 *   `sub` en ferait un seau unique pour tous.
 * - Sinon (anonyme, jeton absent ou invalide) → IP. Ce trafic reste mutualisé derrière Vercel ; le
 *   lever exige de transmettre l'IP client par un canal que Railway ne réécrit pas ET qu'un appel
 *   direct ne peut pas forger (cf. `docs/performance-charge.md`).
 */
export interface RequeteRateLimit {
  ip: string
  headers: { authorization?: string | undefined }
  routeOptions?: { config?: { rateLimit?: unknown } } | undefined
}

export type VerifierJeton = (jeton: string) => { sub?: string; demo?: boolean }

export function cleRateLimit(req: RequeteRateLimit, verifier: VerifierJeton): string {
  const ip = `ip:${req.ip}`
  if (req.routeOptions?.config?.rateLimit !== undefined) return ip

  const entete = req.headers.authorization
  if (!entete?.startsWith('Bearer ')) return ip
  try {
    const { sub, demo } = verifier(entete.slice('Bearer '.length))
    if (!sub || demo === true) return ip
    return `compte:${sub}`
  } catch {
    // Jeton expiré, invalide ou forgé : aucune identité établie, on retombe sur l'IP.
    return ip
  }
}
