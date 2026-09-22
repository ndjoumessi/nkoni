import { ipAddress, next } from '@vercel/functions'

/**
 * Routing Middleware Vercel — transmet au backend l'IP RÉELLE du client, sous secret partagé.
 *
 * **Le problème qu'elle résout** (mesuré en production le 2026-09-19, cf.
 * `docs/performance-charge.md` §2.4) : le navigateur appelle `nkoni.vercel.app/api/*`, que Vercel
 * relaie vers Railway, et Railway RÉÉCRIT `X-Forwarded-For` avec l'adresse de son pair TCP. Le
 * backend voit donc, pour tous les visiteurs, une adresse de SORTIE de Vercel. Le trafic ANONYME —
 * login, inscription, refresh — se retrouve dans une poignée de seaux de rate-limit partagés : une
 * dizaine de personnes suffit à déclencher des 429 pour les autres.
 *
 * **Pourquoi un secret.** Railway est joignable EN DIRECT
 * (`nkoni-backend-production.up.railway.app`) : sans secret, n'importe qui forgerait un en-tête d'IP
 * et s'ouvrirait un seau neuf par valeur inventée, ce qui viderait de son sens le budget
 * anti-force-brute du login. `PROXY_SECRET` distingue « vient de NOTRE proxy » de « prétend en
 * venir ». Il est posé des DEUX côtés, avec la même valeur (Vercel et Railway).
 *
 * **Fail-closed de bout en bout** : pas de secret configuré, pas d'IP résolue, secret non concordant
 * ou IP non parsable → le backend retombe sur l'IP du pair, c'est-à-dire l'état d'avant. Poser la
 * variable d'un seul côté n'a donc aucun effet de bord ; c'est ce qui permet de déployer ce code
 * AVANT que les variables existent.
 *
 * Le `matcher` borne l'exécution à `/api/*` : les fichiers statiques et le HTML de la SPA ne
 * paient pas cette invocation. Un en-tête homonyme envoyé par le client est ÉCRASÉ ici ; et s'il
 * survivait malgré tout, la valeur combinée ne correspondrait pas au secret — donc ignorée.
 */
export const config = {
  matcher: '/api/:path*',
}

export default function middleware(request: Request): Response {
  const secret = process.env['PROXY_SECRET']
  const ip = ipAddress(request)
  if (!secret || !ip) return next()
  return next({
    headers: {
      'x-nkoni-ip-client': ip,
      'x-nkoni-proxy': secret,
    },
  })
}
