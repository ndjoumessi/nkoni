/**
 * Clé de rate-limit (roadmap 2.4) — À QUI imputer une requête.
 *
 * **Pourquoi pas l'IP seule** (mesuré en production le 2026-09-19, logs HTTP Railway) : le navigateur
 * appelle `nkoni.vercel.app/api/*`, que Vercel relaie vers Railway ; or Railway RÉÉCRIT
 * `X-Forwarded-For` avec l'adresse du pair TCP, c'est-à-dire l'adresse de SORTIE de Vercel. Malgré
 * `trustProxy: true`, `req.ip` vaut donc la même poignée d'adresses pour TOUS les utilisateurs : une
 * poignée de seaux de 300 requêtes/min pour toute la plateforme. Un utilisateur actif consomme 20 à 40
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
 * - Sinon (anonyme, jeton absent ou invalide) → IP, résolue par `ipPourRateLimit` ci-dessous.
 *
 * **L'IP anonyme passe par un canal AUTHENTIFIÉ** (`ipPourRateLimit`) : la Routing Middleware Vercel
 * (`frontend/middleware.ts`) ajoute à chaque requête `/api/*` l'IP du client ET un secret partagé
 * `PROXY_SECRET`, posé des DEUX côtés. Le backend n'honore l'IP annoncée que si le secret concorde.
 *
 * Pourquoi un secret et pas simplement `x-vercel-forwarded-for` : Railway est joignable EN DIRECT
 * (`nkoni-backend-production.up.railway.app`), donc n'importe qui peut forger un en-tête d'IP et
 * s'ouvrir un seau neuf par valeur inventée — ce qui rendrait le budget anti-force-brute du login
 * inopérant. Le secret est ce qui distingue « vient de NOTRE proxy » de « prétend en venir ».
 *
 * **Fail-closed, et dans les deux sens** : secret absent de la configuration, secret non concordant,
 * en-tête d'IP absent ou non parsable → on retombe sur l'IP du PAIR, c'est-à-dire l'état d'avant.
 * Rien ne casse si la variable n'est posée que d'un côté, ou sur aucun.
 */

import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

/** En-têtes posés par la Routing Middleware Vercel — voir `frontend/middleware.ts`. */
export const ENTETE_IP_CLIENT = 'x-nkoni-ip-client'
export const ENTETE_SECRET_PROXY = 'x-nkoni-proxy'

export interface RequeteRateLimit {
  ip: string
  headers: {
    authorization?: string | undefined
    [nom: string]: string | string[] | undefined
  }
  routeOptions?: { config?: { rateLimit?: unknown } } | undefined
}

/** Un en-tête RÉPÉTÉ arrive en tableau : on ne l'accepte pas — un secret n'a qu'une valeur. */
function enteteUnique(req: RequeteRateLimit, nom: string): string | undefined {
  const valeur = req.headers[nom]
  return typeof valeur === 'string' ? valeur : undefined
}

/** Comparaison en TEMPS CONSTANT, avec garde de longueur (`timingSafeEqual` lève si elles diffèrent). */
function memeSecret(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu)
  const b = Buffer.from(attendu)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * IP à imputer : celle du CLIENT si notre proxy l'a annoncée sous secret, celle du PAIR sinon.
 *
 * `isIP` n'est pas cosmétique : la valeur devient une CLÉ du magasin de rate-limit. Sans elle, une
 * chaîne arbitraire — et arbitrairement longue — y entrerait.
 */
export function ipPourRateLimit(
  req: RequeteRateLimit,
  secretProxy?: string,
): { ip: string; source: 'client' | 'pair' } {
  const pair = { ip: req.ip, source: 'pair' as const }
  if (!secretProxy) return pair
  const secretRecu = enteteUnique(req, ENTETE_SECRET_PROXY)
  if (secretRecu === undefined || !memeSecret(secretRecu, secretProxy)) return pair
  const ipAnnoncee = enteteUnique(req, ENTETE_IP_CLIENT)
  if (ipAnnoncee === undefined || isIP(ipAnnoncee) === 0) return pair
  return { ip: ipAnnoncee, source: 'client' }
}

export type VerifierJeton = (jeton: string) => { sub?: string; demo?: boolean }

export function cleRateLimit(
  req: RequeteRateLimit,
  verifier: VerifierJeton,
  secretProxy?: string,
): string {
  const ip = `ip:${ipPourRateLimit(req, secretProxy).ip}`
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
