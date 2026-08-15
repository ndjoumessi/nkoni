import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Web Push (/notifications/push/*) — (dés)abonnement par APPAREIL + clé publique VAPID.
 * Auth par JWT (sub = id Utilisateur) ; le modèle PushSubscription étant SCOPÉ, subscribe exige
 * une organisation dans le token (400 sinon). Prisma mocké : on capture deleteMany/create.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Routes Web Push', () => {
  let app: FastifyInstance
  let calls: { deleteMany: any[]; create: any[] }

  beforeEach(async () => {
    calls = { deleteMany: [], create: [] }
    const prisma = {
      pushSubscription: {
        deleteMany: async (a: any) => {
          calls.deleteMany.push(a)
          return { count: 0 }
        },
        create: async (a: any) => {
          calls.create.push(a)
          return {}
        },
        findMany: async () => [],
      },
    }
    app = await buildApp({ prisma: prisma as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (extra: Record<string, unknown> = {}) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: 'u-1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1', ...extra })}`,
  })
  const corps = { endpoint: 'https://push/e', keys: { p256dh: 'PP', auth: 'AA' } }

  it('POST subscribe (201) enregistre l’abonnement avec les bonnes données', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      headers: auth(),
      payload: corps,
    })
    expect(res.statusCode).toBe(201)
    expect(calls.deleteMany[0]).toEqual({ where: { endpoint: 'https://push/e' } })
    expect(calls.create[0]).toEqual({
      data: { destinataireId: 'u-1', endpoint: 'https://push/e', p256dh: 'PP', auth: 'AA' },
    })
  })

  it('POST subscribe SANS organisation (SUPER_ADMIN) → 400, aucun write', async () => {
    const token = app.jwt.sign({ sub: 'sa', role: 'SUPER_ADMIN' }) // pas d'organisationId
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: corps,
    })
    expect(res.statusCode).toBe(400)
    expect(calls.create).toHaveLength(0)
  })

  it('DELETE subscribe (204) supprime par endpoint', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/notifications/push/subscribe',
      headers: auth(),
      payload: { endpoint: 'https://push/e' },
    })
    expect(res.statusCode).toBe(204)
    expect(calls.deleteMany[0]).toEqual({ where: { endpoint: 'https://push/e' } })
  })

  it('GET cle-publique renvoie la clé VAPID publique', async () => {
    const sauve = process.env['VAPID_PUBLIC_KEY']
    process.env['VAPID_PUBLIC_KEY'] = 'BTESTKEY'
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications/push/cle-publique',
        headers: auth(),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ clePublique: 'BTESTKEY' })
    } finally {
      if (sauve) process.env['VAPID_PUBLIC_KEY'] = sauve
      else delete process.env['VAPID_PUBLIC_KEY']
    }
  })

  it('401 sans token', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications/push/cle-publique' })
    expect(res.statusCode).toBe(401)
  })
})
