import { describe, it, expect } from 'vitest'
import { supprimerOrganisationDemo } from '../src/services/demo-suppression.service'

/**
 * Course concurrente (revue whole-branch, finding minor #3) : entre la lecture initiale (hors
 * transaction) et l'écriture DANS la transaction, une autre exécution a fini de supprimer la même
 * démo (deux régénérations qui se chevauchent, par exemple). Le chemin doit s'arrêter proprement
 * (`supprimee: false`), jamais lever `OrganisationNonDemoError` — cette erreur reste réservée à une
 * organisation qui N'EST PAS une démo, cas qui remonterait sinon jusqu'à `observabilite.signaler`
 * pour un incident Sentry sans objet.
 *
 * Prisma entièrement simulé (aucune base) : ce test cible la distinction faite DANS le service, pas
 * le comportement réel de Postgres — déjà couvert en intégration par
 * `demo-suppression.integration.test.ts` (organisation réelle refusée, démo supprimée, id déjà
 * disparu AVANT tout appel toléré).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaAvecCourseConcurrente(): any {
  const org = { id: 'org-demo', nom: 'Démo', estDemo: true, createdAt: new Date() }
  const accesseurVide = { findMany: async () => [] as unknown[] }
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'organisation') return { findUnique: async () => org }
        if (prop === '$transaction') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (cb: (tx: any) => Promise<unknown>) =>
            cb(
              new Proxy(
                {},
                {
                  get(_t2, prop2: string) {
                    if (prop2 === 'organisation') {
                      return {
                        // Relue DANS la transaction : déjà supprimée par une exécution concurrente.
                        findUnique: async () => null,
                        updateMany: async () => {
                          throw new Error('ne doit pas être appelé : la relecture doit arrêter avant')
                        },
                      }
                    }
                    return accesseurVide
                  },
                },
              ),
            )
        }
        return accesseurVide
      },
    },
  )
}

describe('supprimerOrganisationDemo — course concurrente', () => {
  it('déjà supprimée entre la lecture initiale et la transaction : abandon gracieux, pas d’erreur', async () => {
    const prisma = prismaAvecCourseConcurrente()
    const blob = { del: async () => undefined }
    const resultat = await supprimerOrganisationDemo(prisma, blob, 'org-demo')
    expect(resultat).toEqual({ supprimee: false, compteurs: {}, blobs: { supprimes: 0, echecs: [] }, journalise: false })
  })
})
