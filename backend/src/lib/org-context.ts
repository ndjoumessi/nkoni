import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexte d'ORGANISATION par requête (SaaS §2.2) — porte l'`organisationId` de
 * l'utilisateur authentifié jusqu'à l'extension Prisma d'isolation, qui n'a pas accès à
 * `req.user`. Calqué sur `audit-context` (même mécanisme AsyncLocalStorage).
 *
 * Deux modes portés par le store :
 *   - `organisationId` : scoping actif → toute requête sur un modèle scopé est filtrée.
 *   - `unscoped: true` : bypass DÉLIBÉRÉ, réservé aux flux légitimes sans organisation
 *     (login par email avant de connaître l'org, refresh, tâche système/scheduler, seed,
 *     futur Super-Admin plateforme). Tout le reste est FAIL-CLOSED : sur un modèle scopé,
 *     l'absence de contexte org (ni id, ni unscoped) fait ÉCHOUER la requête (pas de fuite).
 */

export interface OrgStore {
  organisationId?: string
  unscoped?: boolean
}

const als = new AsyncLocalStorage<OrgStore>()

export const orgContext = {
  /** Établit un store vide pour la requête courante (hook onRequest). */
  enter(): void {
    als.enterWith({})
  },
  /** Renseigne l'organisation courante (appelé après vérification du JWT). */
  setOrganisation(organisationId: string | undefined): void {
    const store = als.getStore()
    if (store && organisationId) store.organisationId = organisationId
  },
  /** id de l'organisation courante, ou undefined. */
  organisationId(): string | undefined {
    return als.getStore()?.organisationId
  },
  /** Le store courant, ou undefined (aucun contexte établi). */
  current(): OrgStore | undefined {
    return als.getStore()
  },
  /** Exécute `fn` dans un store donné (tests, ou établissement du contexte de requête). */
  run<T>(store: OrgStore, fn: () => T): T {
    return als.run(store, fn)
  },
  /**
   * Exécute une opération DÉLIBÉRÉMENT non scopée. À réserver aux flux qui ne peuvent pas
   * avoir de contexte org (login par email, refresh, système/scheduler, seed, Super-Admin).
   */
  runUnscoped<T>(fn: () => T): T {
    return als.run({ unscoped: true }, fn)
  },
}
