import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes de paiement — gardes d'auth + comportement du webhook public. Le flux complet (confirmation
 * → versement + reçu) frappe la transaction/le contexte org et est couvert en intégration ; ici on
 * verrouille l'auth et le fait que le webhook n'agit PAS sur un transId inconnu (200 silencieux).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const auth = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1' })}`,
})

describe('POST /moi/paiements', () => {
  it('sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'POST', url: '/moi/paiements', payload: { contributionId: 'c1', montant: 12000 } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('compte sans fiche membre → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST', url: '/moi/paiements', headers: auth(app),
      payload: { contributionId: 'c1', montant: 12000 },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('montant < 100 → 400 (schéma)', async () => {
    const app = await appAvec({})
    const res = await app.inject({
      method: 'POST', url: '/moi/paiements', headers: auth(app),
      payload: { contributionId: 'c1', montant: 50 },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})

describe('POST /webhooks/fapshi (public)', () => {
  it('sans transId → 200 sans effet', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'POST', url: '/webhooks/fapshi', payload: {} })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('transId inconnu → 200 silencieux (aucune confirmation)', async () => {
    let confirmAppele = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      paiement: {
        findFirst: async () => { confirmAppele = true; return null }, // aucun Paiement pour ce transId
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/webhooks/fapshi', payload: { transId: 'inconnu' } })
    expect(res.statusCode).toBe(200)
    expect(confirmAppele).toBe(true) // la résolution a bien été tentée…
    await app.close()
  })
})
