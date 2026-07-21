/**
 * OBSERVABILITÉ (bloquant GA 0.1, point M7 de l'audit) — remontée des erreurs vers Sentry.
 *
 * Même motif que `vraiWhatsAppClient` (§4.6) et `vercelBlobClient` (§5) : un client **MOCKABLE**,
 * injectable dans `buildApp`, dont la config réelle (`SENTRY_DSN`) n'est lue que par
 * `vraiObservabiliteClient`. **Sans DSN, tout est NO-OP** — le code se comporte identiquement avec
 * ou sans compte Sentry, et les tests n'ont besoin d'aucun réseau.
 *
 * Pourquoi une COUCHE plutôt qu'un `Sentry.captureException` dispersé dans le code :
 *  - les points d'appel (gestionnaire d'erreur Fastify, échec d'audit, échec de scheduler) restent
 *    testables — on injecte un mock et on ASSERTE qu'ils signalent, ce qu'un appel statique au SDK
 *    ne permet pas ;
 *  - changer de fournisseur ne touche qu'ici ;
 *  - la règle « ne JAMAIS faire échouer l'opération métier » est tenue à UN endroit (cf. `signaler`),
 *    au lieu d'être reconduite à la main à chaque `catch`.
 *
 * ⚠️ Ce module ne journalise PAS : les appelants gardent leur `log.error`/`console.error` existant.
 * Il ne fait qu'AJOUTER l'alerte. Un incident doit rester lisible dans les logs Railway même si
 * Sentry est indisponible ou non configuré.
 */

/** Contexte structuré joint à l'erreur — sert d'étiquettes de recherche/regroupement dans Sentry. */
export interface ContexteErreur {
  /** D'où vient l'incident : 'http' | 'audit' | 'scheduler' | … (devient un tag Sentry). */
  source: string
  /** Détails additionnels (route, modèle, organisationId…). AUCUNE donnée sensible. */
  [cle: string]: unknown
}

export interface ObservabiliteClient {
  /** La config est-elle présente (DSN) ? */
  disponible(): boolean
  /**
   * Signale une erreur. **NE LÈVE JAMAIS** — un incident d'observabilité ne doit pas provoquer
   * l'incident qu'il est censé rapporter.
   */
  signaler(erreur: unknown, contexte: ContexteErreur): void
}

/** Client inerte — utilisé en test, et implicitement en dev (pas de DSN). */
export const observabiliteNoop: ObservabiliteClient = {
  disponible: () => false,
  signaler: () => {},
}

/**
 * Client réel Sentry. L'initialisation est PARESSEUSE et faite une seule fois : le module est
 * importé par `app.ts` y compris dans les tests, où l'on ne veut ni SDK actif ni réseau.
 */
let initialise = false

function initialiserSiNecessaire(): boolean {
  const dsn = process.env['SENTRY_DSN']
  if (!dsn) return false
  if (initialise) return true
  try {
    // Import synchrone paresseux : sans DSN, le SDK n'est jamais chargé.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node') as typeof import('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      // Pas de tracing : on cherche à être ALERTÉ des erreurs, pas à profiler. Le tracing
      // échantillonne des requêtes et coûte du quota pour un besoin qu'on n'a pas encore.
      tracesSampleRate: 0,
      // Les corps de requête peuvent porter des PII (téléphones, noms) et des secrets (mots de
      // passe sur /auth/login) : on ne les envoie jamais.
      sendDefaultPii: false,
    })
    initialise = true
    return true
  } catch {
    // SDK absent ou init impossible → on reste silencieux plutôt que de casser le démarrage.
    return false
  }
}

export const vraiObservabiliteClient: ObservabiliteClient = {
  disponible() {
    return Boolean(process.env['SENTRY_DSN'])
  },
  signaler(erreur, contexte) {
    try {
      if (!initialiserSiNecessaire()) return
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node') as typeof import('@sentry/node')
      const { source, ...extra } = contexte
      Sentry.withScope((scope) => {
        scope.setTag('source', source)
        scope.setExtras(extra as Record<string, unknown>)
        Sentry.captureException(erreur)
      })
    } catch {
      // Best-effort ABSOLU : une panne de Sentry ne doit jamais remonter dans le flux métier.
    }
  },
}
