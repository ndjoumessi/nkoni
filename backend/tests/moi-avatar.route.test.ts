import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Avatar de COMPTE — /moi/avatar. Comme /moi/photo mais porté par `Utilisateur` (tout compte, même
 * sans fiche membre). On vérifie les GARDES (auth) et le verrou anti-IDOR : le compte est résolu depuis
 * `req.user.sub`, jamais un id d'URL. Le round-trip Blob est couvert ailleurs ; les mocks court-circuitent
 * avant tout accès Blob. Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const auth = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'ADMIN', organisationId: 'org-1' })}`,
})

describe('/moi/avatar (avatar de compte)', () => {
  it('GET sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'GET', url: '/moi/avatar' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('POST sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'POST', url: '/moi/avatar' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('DELETE sans authentification → 401', async () => {
    const app = await appAvec({})
    const res = await app.inject({ method: 'DELETE', url: '/moi/avatar' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET : compte sans avatar → 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { utilisateur: { findUnique: async () => ({ photoBlobUrl: null, photoMime: null }) } }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/moi/avatar', headers: auth(app) })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET : résout le compte par le sub de l’appelant (verrou anti-IDOR)', async () => {
    let whereRecu: unknown = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      utilisateur: { findUnique: async ({ where }: any) => { whereRecu = where; return { photoBlobUrl: null } } },
    }
    const app = await appAvec(prisma)
    await app.inject({ method: 'GET', url: '/moi/avatar', headers: auth(app) })
    expect(whereRecu).toEqual({ id: 'u1' })
    await app.close()
  })

  it('DELETE : sans avatar existant → 204 sans toucher au Blob', async () => {
    let updateAppele = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      utilisateur: {
        findUnique: async () => ({ photoBlobUrl: null, photoMime: null }),
        update: async () => { updateAppele = true },
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'DELETE', url: '/moi/avatar', headers: auth(app) })
    expect(res.statusCode).toBe(204)
    expect(updateAppele).toBe(false) // rien à supprimer → pas d'écriture
    await app.close()
  })
})
