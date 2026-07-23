import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Photo SELF-SERVICE — /moi/photo. On vérifie les GARDES (auth + fiche liée) et surtout le VERROU
 * anti-IDOR : la fiche est résolue depuis `req.user.sub`, jamais un id d'URL. Le round-trip Blob
 * (upload/lecture réels) est couvert ailleurs ; ici les mocks court-circuitent avant tout accès Blob.
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
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

describe('/moi/photo (self-service)', () => {
  it('GET sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/moi/photo' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('POST sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'POST', url: '/moi/photo' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET : compte sans fiche liée → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => null } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/moi/photo', headers: auth(app) })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET : fiche sans photo → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async () => ({ id: 'm1', photoBlobUrl: null, photoMime: null }) } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/moi/photo', headers: auth(app) })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET : résout la fiche par le sub de l’appelant (verrou anti-IDOR)', async () => {
    let whereRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { membre: { findFirst: async ({ where }: any) => { whereRecu = where; return null } } }
    const app = await appAvec(prisma)
    await app.inject({ method: 'GET', url: '/moi/photo', headers: auth(app) })
    expect(whereRecu).toEqual({ compteUtilisateurId: 'u1' })
    await app.close()
  })
})
