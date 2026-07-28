import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * RSVP / présence aux réunions. On verrouille les gardes (auth, membre lié résolu par `sub`,
 * permission dirigeant) et le comportement d'upsert. Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}
const authMembre = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1' })}`,
})
const authAdmin = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u9', role: 'ADMIN', organisationId: 'org-1' })}`,
})

describe('PUT /moi/reunions/:id/rsvp (membre self-service)', () => {
  it('sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'PUT', url: '/moi/reunions/r1/rsvp', payload: { statut: 'PRESENT' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('compte sans fiche membre → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/reunions/r1/rsvp', headers: authMembre(app), payload: { statut: 'PRESENT' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('réunion inexistante → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => ({ id: 'm1' }) }, reunion: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/reunions/r1/rsvp', headers: authMembre(app), payload: { statut: 'PRESENT' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('happy path : upsert sur (réunion, membre) résolu par le sub, renvoie le statut', async () => {
    let whereRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      membre: { findFirst: async ({ where }: any) => (where.compteUtilisateurId === 'u1' ? { id: 'm1' } : null) },
      reunion: { findFirst: async () => ({ id: 'r1' }) },
      presenceReunion: { upsert: async ({ where }: any) => { whereRecu = where; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/moi/reunions/r1/rsvp', headers: authMembre(app), payload: { statut: 'EXCUSE' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ statut: 'EXCUSE' })
    expect(whereRecu).toEqual({ reunionId_membreId: { reunionId: 'r1', membreId: 'm1' } })
    await app.close()
  })

  it('statut invalide → 400 (schéma)', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'PUT', url: '/moi/reunions/r1/rsvp', headers: authMembre(app), payload: { statut: 'PEUT_ETRE' } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})

describe('présences côté dirigeant', () => {
  it('GET /reunions/:id/presences sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/reunions/r1/presences' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET presences → liste + décompte', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      reunion: { findFirst: async () => ({ id: 'r1' }) },
      presenceReunion: {
        findMany: async () => [
          { membreId: 'm1', statut: 'PRESENT', membre: { nom: 'A', prenom: 'x' } },
          { membreId: 'm2', statut: 'EXCUSE', membre: { nom: 'B', prenom: 'y' } },
        ],
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/reunions/r1/presences', headers: authAdmin(app) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.presences).toHaveLength(2)
    expect(body.decompte).toEqual({ PRESENT: 1, ABSENT: 0, EXCUSE: 1 })
    await app.close()
  })

  it('PUT /reunions/:id/presences/:membreId (ADMIN) ajuste la présence', async () => {
    let statutRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      reunion: { findFirst: async () => ({ id: 'r1' }) },
      membre: { findFirst: async () => ({ id: 'm1' }) },
      presenceReunion: { upsert: async ({ create }: any) => { statutRecu = create.statut; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'PUT', url: '/reunions/r1/presences/m1', headers: authAdmin(app), payload: { statut: 'ABSENT' } })
    expect(res.statusCode).toBe(200)
    expect(statutRecu).toBe('ABSENT')
    await app.close()
  })
})
