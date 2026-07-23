import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Bannière d'incident (§2.2/§8) — GET /statut/incident (public) + PUT /platform/statut/incident
 * (super-admin). Prisma mocké (ligne unique). Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockPrisma(initial: any = null) {
  const state = { row: initial, dernierUpsert: null as any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    statutIncident: {
      findUnique: async () => state.row,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsert: async ({ create, update }: any) => {
        state.dernierUpsert = update
        state.row = { id: 'singleton', ...create, ...update, updatedAt: new Date() }
        return state.row
      },
    },
  }
  return { prisma, state }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const auth = (app: FastifyInstance, role: string, org?: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role, ...(org ? { organisationId: org } : {}) })}`,
})

describe('GET /statut/incident (public)', () => {
  it('aucune bannière → { actif: false }', async () => {
    const app = await appAvec(mockPrisma(null).prisma)
    const res = await app.inject({ method: 'GET', url: '/statut/incident' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ actif: false })
    await app.close()
  })

  it('bannière ACTIVE → renvoie gravité + message', async () => {
    const { prisma } = mockPrisma({ actif: true, gravite: 'INCIDENT', message: 'Panne en cours' })
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/statut/incident' })
    expect(res.json()).toMatchObject({ actif: true, gravite: 'INCIDENT', message: 'Panne en cours' })
    await app.close()
  })

  it('bannière INACTIVE → { actif: false } et le message N’est PAS divulgué', async () => {
    const { prisma } = mockPrisma({ actif: false, gravite: 'INFO', message: 'brouillon secret' })
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'GET', url: '/statut/incident' })
    expect(res.json()).toEqual({ actif: false })
    expect(JSON.stringify(res.json())).not.toContain('brouillon')
    await app.close()
  })
})

describe('GET /platform/statut/incident (super-admin)', () => {
  it('SUPER_ADMIN → état COMPLET, message visible même si inactif', async () => {
    const { prisma } = mockPrisma({ actif: false, gravite: 'INFO', message: 'brouillon' })
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'GET',
      url: '/platform/statut/incident',
      headers: auth(app, 'SUPER_ADMIN'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ actif: false, message: 'brouillon' })
    await app.close()
  })

  it('ADMIN de tenant → 403', async () => {
    const app = await appAvec(mockPrisma().prisma)
    const res = await app.inject({
      method: 'GET',
      url: '/platform/statut/incident',
      headers: auth(app, 'ADMIN', 'org-1'),
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

describe('PUT /platform/statut/incident (super-admin)', () => {
  it('SUPER_ADMIN → 200, upsert avec message trimé', async () => {
    const { prisma, state } = mockPrisma()
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'PUT',
      url: '/platform/statut/incident',
      headers: auth(app, 'SUPER_ADMIN'),
      payload: { actif: true, gravite: 'MAINTENANCE', message: '  Maintenance prévue  ' },
    })
    expect(res.statusCode).toBe(200)
    expect(state.dernierUpsert).toMatchObject({ actif: true, gravite: 'MAINTENANCE', message: 'Maintenance prévue' })
    await app.close()
  })

  it('ADMIN de tenant → 403 (réservé plateforme)', async () => {
    const { prisma, state } = mockPrisma()
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'PUT',
      url: '/platform/statut/incident',
      headers: auth(app, 'ADMIN', 'org-1'),
      payload: { actif: true, gravite: 'INFO', message: 'x' },
    })
    expect(res.statusCode).toBe(403)
    expect(state.dernierUpsert).toBeNull()
    await app.close()
  })

  it('sans authentification → 401', async () => {
    const app = await appAvec(mockPrisma().prisma)
    const res = await app.inject({
      method: 'PUT',
      url: '/platform/statut/incident',
      payload: { actif: true, gravite: 'INFO', message: 'x' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('gravité hors enum / message vide → 400', async () => {
    const app = await appAvec(mockPrisma().prisma)
    for (const payload of [
      { actif: true, gravite: 'BOOM', message: 'x' },
      { actif: true, gravite: 'INFO', message: '' },
      { actif: true, gravite: 'INFO' },
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/platform/statut/incident',
        headers: auth(app, 'SUPER_ADMIN'),
        payload: payload as Record<string, unknown>,
      })
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
    await app.close()
  })
})
