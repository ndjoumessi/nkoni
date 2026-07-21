/**
 * OBSERVABILITÉ FRONT (bloquant GA 0.1) — miroir de `backend/src/lib/observabilite.ts`.
 *
 * **Inerte sans `VITE_SENTRY_DSN`** : en dev, en test et tant que la variable n'est pas posée sur
 * Vercel, rien n'est chargé ni envoyé. Le SDK est importé DYNAMIQUEMENT pour que son poids ne
 * grève pas le bundle quand l'observabilité n'est pas configurée.
 *
 * Ce qui est filtré, et pourquoi :
 *  - `sendDefaultPii: false` — les écrans manipulent des noms, téléphones et montants de membres.
 *    Un rapport d'erreur ne doit pas devenir une fuite de données d'association.
 *  - pas de tracing (`tracesSampleRate: 0`) — on cherche à être ALERTÉ, pas à profiler ; le
 *    tracing consommerait du quota pour un besoin qu'on n'a pas.
 *  - les erreurs réseau ordinaires (`ApiError` 4xx, coupure) ne sont PAS remontées : sur une PWA
 *    utilisée en mobilité et hors-ligne, elles sont ATTENDUES. Les signaler noierait les vrais
 *    incidents sous du bruit — cf. `estIncidentDigneDAlerte`.
 */

import { ApiError } from '@/lib/api'

let init: Promise<typeof import('@sentry/react')> | null = null

function dsn(): string | undefined {
  return import.meta.env['VITE_SENTRY_DSN'] as string | undefined
}

/** L'observabilité est-elle configurée ? */
export function observabiliteActive(): boolean {
  return Boolean(dsn())
}

/**
 * Une erreur mérite-t-elle une alerte ?
 *
 * NON pour tout ce qui relève du fonctionnement normal d'une PWA en mobilité :
 *  - `ApiError` < 500 : refus métier ou validation — l'utilisateur voit déjà un message clair,
 *    ce n'est pas une panne (un 409 « reçu déjà émis » est le système qui fonctionne) ;
 *  - échec de `fetch` : perte de réseau, attendue et déjà gérée par la file hors-ligne.
 *
 * OUI pour les 5xx (l'API est cassée) et pour toute erreur non réseau (bug de rendu React).
 */
export function estIncidentDigneDAlerte(erreur: unknown): boolean {
  if (erreur instanceof ApiError) return erreur.status >= 500
  if (erreur instanceof TypeError && /fetch|network/i.test(erreur.message)) return false
  return true
}

/** Charge et initialise le SDK, une seule fois. Renvoie `null` si non configuré. */
async function sdk(): Promise<typeof import('@sentry/react') | null> {
  const d = dsn()
  if (!d) return null
  if (!init) {
    init = import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: d,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
        sendDefaultPii: false,
      })
      return Sentry
    })
  }
  return init
}

/**
 * Signale une erreur. **NE LÈVE JAMAIS** et n'attend pas : l'appelant n'a pas à gérer
 * l'observabilité, encore moins à échouer à cause d'elle.
 */
export function signaler(erreur: unknown, contexte: Record<string, unknown> = {}): void {
  if (!estIncidentDigneDAlerte(erreur)) return
  void sdk()
    .then((Sentry) => {
      if (!Sentry) return
      Sentry.withScope((scope) => {
        scope.setExtras(contexte)
        Sentry.captureException(erreur)
      })
    })
    .catch(() => {
      // Best-effort absolu : une panne de Sentry ne doit pas se voir dans l'application.
    })
}
