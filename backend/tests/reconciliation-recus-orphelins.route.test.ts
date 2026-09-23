import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * `GET /tresorerie/reconciliation` rend DEUX invariants, pas un.
 *
 * `recusActifsOrphelins` existait, documenté sur douze lignes comme LA preuve de l'invariant
 * « un reçu ACTIF a toujours un versement » et comme la parade à la course assumée en
 * READ COMMITTED de `appliquerSuppressionVersement` — et n'avait AUCUN appelant. Il est branché
 * ici ; ce test est ce qui empêche la promesse de redevenir creuse.
 *
 * Un reçu actif sans versement n'est pas une curiosité : son numéro séquentiel a été consommé et
 * il a pu être remis au membre, alors que le versement qu'il atteste n'existe plus.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const tresoriere = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'TRESORIERE', organisationId: 'org-1', langue: 'FR' })}`,
})

/** Cumuls COHÉRENTS (aucun écart de réconciliation) ; seuls les orphelins varient. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socle = (orphelins: unknown[]): any => ({
  contribution: {
    findMany: async () => [{ id: 'c1', membreId: 'm1', annee: 2026, montantVerse: 10000 }],
  },
  versement: { groupBy: async () => [{ contributionId: 'c1', _sum: { montant: 10000 } }] },
  recu: { findMany: async () => orphelins },
})

const lire = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: '/tresorerie/reconciliation', headers: tresoriere(app) })

describe('GET /tresorerie/reconciliation — reçus actifs orphelins', () => {
  it('base saine → cohérent, et la liste d’orphelins est présente et vide', async () => {
    const app = await appAvec(socle([]))
    const res = await lire(app)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      coherent: true,
      nbEcarts: 0,
      nbRecusActifsOrphelins: 0,
      recusActifsOrphelins: [],
    })
    await app.close()
  })

  it('un reçu ACTIF sans versement rend la base INCOHÉRENTE, même sans écart de cumul', async () => {
    // Le point du branchement : les cumuls concordent parfaitement, et pourtant l'invariant est
    // rompu. Avant, ce cas rendait `coherent: true` — la réconciliation ne le regardait pas.
    const app = await appAvec(
      socle([{ id: 'r1', numero: 'REC-2026-000042', membreId: 'm1' }]),
    )
    const corps = (await lire(app)).json()
    expect(corps.coherent).toBe(false)
    expect(corps.nbEcarts).toBe(0)
    expect(corps.nbRecusActifsOrphelins).toBe(1)
    expect(corps.recusActifsOrphelins[0]).toMatchObject({ numero: 'REC-2026-000042' })
    await app.close()
  })

  it('ne compte QUE les reçus actifs ET sans versement', async () => {
    // Un reçu ANNULÉ orphelin est NORMAL et attendu : c'est la trace conservée d'un versement
    // supprimé après annulation (`Recu.versementId` en `onDelete: SetNull`). Le filtre porte donc
    // sur les deux conditions à la fois — c'est le `where` du service qu'on verrouille ici.
    const app = await appAvec(socle([]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vu: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(app as any).prisma.recu.findMany = async (args: any) => {
      vu = args
      return []
    }
    await lire(app)
    expect(vu.where).toEqual({ versementId: null, annuleLe: null })
    await app.close()
  })
})
