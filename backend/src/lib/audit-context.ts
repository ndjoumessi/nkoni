import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexte de requête pour l'audit (V2 §5). L'extension Prisma qui écrit les entrées
 * d'audit n'a pas accès à `req.user` ; on transporte donc l'identité de l'acteur via
 * AsyncLocalStorage : établi par un hook onRequest, renseigné par le middleware d'auth.
 * Absent (ou non authentifié) ⇒ `acteurId` null (écriture système : seed, migration…).
 *
 * **POURQUOI DEUX AsyncLocalStorage et pas un seul** (question posée par la revue d'architecture,
 * `org-context` étant « celui-ci moins `runUnscoped` »). Les fusionner ferait perdre l'acteur :
 * `orgContext.run(store, fn)` REMPLACE le store, il ne le complète pas — c'est cette propriété qui
 * rend `runUnscoped` sûr, puisqu'un bypass d'isolation ne doit hériter d'aucun contexte. Or
 * `demo-generateur.service` imbrique délibérément `auditContext.run({ acteurId })` AUTOUR de
 * `orgContext.run({ organisationId })` : avec un store unique, l'appel interne écraserait l'acteur
 * et toute la génération de la démo serait tracée comme une écriture système.
 *
 * Il faudrait donc, pour fusionner, faire de `run` une FUSION de stores — ce qui affaiblirait
 * précisément la garantie sur laquelle repose `runUnscoped`. Deux mécanismes de trente lignes,
 * indépendamment testés, coûtent moins que ce couplage. La duplication est assumée, pas subie.
 */

interface AuditStore {
  acteurId?: string
}

const als = new AsyncLocalStorage<AuditStore>()

export const auditContext = {
  /** Établit un store vide pour la requête courante (hook onRequest). */
  enter(): void {
    als.enterWith({})
  },
  /** Renseigne l'acteur (appelé après vérification du JWT). */
  setActeur(acteurId: string | undefined): void {
    const store = als.getStore()
    if (store && acteurId) store.acteurId = acteurId
  },
  /** id de l'acteur courant, ou undefined (écriture système). */
  acteurId(): string | undefined {
    return als.getStore()?.acteurId
  },
  /** Exécute `fn` dans un store donné (utile en test pour fixer l'acteur). */
  run<T>(store: AuditStore, fn: () => T): T {
    return als.run(store, fn)
  },
}
