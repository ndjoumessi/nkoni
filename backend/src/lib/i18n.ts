/**
 * Traduction des messages serveur (§4 i18n) — messages d'erreur et notifications rendus dans
 * la langue de l'utilisateur DESTINATAIRE.
 *
 * Choix (documenté, cf. CLAUDE.md) : catalogues de ressources par langue en modules TypeScript
 * (`locales/fr.ts`, `locales/en.ts`) plutôt qu'en `.json`. Raison : (1) parité des clés vérifiée
 * à la COMPILATION (EN typé `Messages` ⟹ mêmes clés que FR), (2) pas de copie de fichiers `.json`
 * vers `dist/` à gérer (le build backend est un simple `tsc`).
 *
 * Résolution de la langue d'une requête HTTP (`langueDeRequete`) :
 *   1. `req.user.langue` (portée dans l'access token) — cas authentifié nominal ;
 *   2. sinon en-tête `Accept-Language` (routes non authentifiées : login, refresh) ;
 *   3. sinon FR (défaut).
 */
import type { FastifyRequest } from 'fastify'
import { fr, type CleMessage, type Messages } from '../locales/fr'
import { en } from '../locales/en'

export type Langue = 'FR' | 'EN'

const CATALOGUES: Record<Langue, Messages> = { FR: fr, EN: en }

/** Remplace les jetons `{nom}` d'un gabarit par les paramètres fournis. */
function interpole(gabarit: string, params?: Record<string, string | number>): string {
  if (!params) return gabarit
  return gabarit.replace(/\{(\w+)\}/g, (brut, cle: string) =>
    cle in params ? String(params[cle]) : brut,
  )
}

/**
 * Traduit une clé dans la langue donnée, avec interpolation optionnelle.
 * Repli sur FR si la clé manque dans la langue cible (ne devrait pas arriver : parité typée).
 */
export function t(
  langue: Langue,
  cle: CleMessage,
  params?: Record<string, string | number>,
): string {
  const catalogue = CATALOGUES[langue] ?? fr
  return interpole(catalogue[cle] ?? fr[cle], params)
}

/** Vrai si la valeur est une langue supportée. */
export function estLangue(valeur: unknown): valeur is Langue {
  return valeur === 'FR' || valeur === 'EN'
}

/** Parse un en-tête `Accept-Language` : EN si l'anglais est demandé en tête, sinon FR. */
function langueDepuisAcceptLanguage(entete: string | undefined): Langue {
  if (!entete) return 'FR'
  // On regarde la 1re préférence linguistique (avant la 1re virgule / le 1er `;q=`).
  const premiere = entete.split(',')[0]?.trim().toLowerCase() ?? ''
  return premiere.startsWith('en') ? 'EN' : 'FR'
}

/**
 * Langue effective d'une requête : préférence de l'utilisateur authentifié (portée dans le
 * token) → Accept-Language → FR. Utilisable dans tout handler (authentifié ou non).
 */
export function langueDeRequete(req: FastifyRequest): Langue {
  const prefUtilisateur = (req.user as { langue?: unknown } | undefined)?.langue
  if (estLangue(prefUtilisateur)) return prefUtilisateur
  const entete = req.headers['accept-language']
  return langueDepuisAcceptLanguage(typeof entete === 'string' ? entete : undefined)
}
