import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexte de requête pour l'audit (V2 §5). L'extension Prisma qui écrit les entrées
 * d'audit n'a pas accès à `req.user` ; on transporte donc l'identité de l'acteur via
 * AsyncLocalStorage : établi par un hook onRequest, renseigné par le middleware d'auth.
 * Absent (ou non authentifié) ⇒ `acteurId` null (écriture système : seed, migration…).
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
