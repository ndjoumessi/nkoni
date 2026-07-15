import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Rôle plateforme SUPER_ADMIN (SaaS §2.3) — routes /platform/* (Prisma mocké).
 * Vérifie : garde de rôle (403 hors super-admin, 401 sans token), liste des organisations
 * avec compteurs de membres, suspension/réactivation, 404 sur organisation inconnue.
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement (.env).
 */

function buildMock() {
  const orgs = [
    {
      id: 'org-a',
      nom: 'WAMBA TCHOUPA',
      devise: 'FCFA',
      langueDefaut: 'FR',
      actif: true,
      forfait: 'GRATUIT',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'org-b',
      nom: 'Amicale X',
      devise: 'EUR',
      langueDefaut: 'FR',
      actif: true,
      forfait: 'GRATUIT',
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: { id: string; [k: string]: any }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    organisation: {
      findMany: async () => orgs.map((o) => ({ ...o })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const org = orgs.find((o) => o.id === where.id)
        if (!org) {
          // Simule l'erreur Prisma « enregistrement introuvable » (→ 404 dans la route).
          throw Object.assign(new Error('No record was found for an update.'), { code: 'P2025' })
        }
        updates.push({ id: where.id, ...data })
        return { ...org, ...data }
      },
    },
    membre: {
      // groupBy : org-a a 3 membres, org-b en a 1.
      groupBy: async () => [
        { organisationId: 'org-a', _count: { _all: 3 } },
        { organisationId: 'org-b', _count: { _all: 1 } },
      ],
    },
  }
  return { prisma, updates }
}

async function appAvec(prisma: unknown): Promise<FastifyInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = await buildApp({ prisma: prisma as any, logger: false })
  await app.ready()
  return app
}

// Un SUPER_ADMIN transverse : JWT SANS claim organisationId (comme en réel).
const superAdmin = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'sa-1', role: 'SUPER_ADMIN' })}`,
})
// Un ADMIN d'organisation (rôle tenant) : porte un organisationId.
const adminTenant = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u-1', role: 'ADMIN', organisationId: 'org-a' })}`,
})

describe('Routes plateforme — /platform/* (SUPER_ADMIN)', () => {
  let app: FastifyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let updates: { id: string; [k: string]: any }[]

  beforeEach(async () => {
    const mock = buildMock()
    updates = mock.updates
    app = await appAvec(mock.prisma)
  })
  afterEach(async () => {
    await app.close()
  })

  describe('Garde de rôle', () => {
    it('sans token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/platform/organisations' })
      expect(res.statusCode).toBe(401)
    })

    it('rôle tenant (ADMIN) → 403 (pas d\'accès plateforme)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/platform/organisations',
        headers: adminTenant(app),
      })
      expect(res.statusCode).toBe(403)
    })

    it('suspension refusée à un ADMIN tenant → 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/organisations/org-a/suspendre',
        headers: adminTenant(app),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /platform/organisations', () => {
    it('SUPER_ADMIN → 200, liste + statut + date + nombre de membres', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/platform/organisations',
        headers: superAdmin(app),
      })
      expect(res.statusCode).toBe(200)
      const { organisations } = res.json()
      expect(organisations).toHaveLength(2)

      const a = organisations.find((o: { id: string }) => o.id === 'org-a')
      expect(a).toMatchObject({ nom: 'WAMBA TCHOUPA', actif: true, nbMembres: 3 })
      const b = organisations.find((o: { id: string }) => o.id === 'org-b')
      expect(b).toMatchObject({ nom: 'Amicale X', actif: true, nbMembres: 1 })
    })
  })

  describe('Suspension / réactivation', () => {
    it('suspendre une organisation → 200, actif = false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/organisations/org-a/suspendre',
        headers: superAdmin(app),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().organisation).toMatchObject({ id: 'org-a', actif: false })
      expect(updates).toContainEqual({ id: 'org-a', actif: false })
    })

    it('réactiver une organisation → 200, actif = true', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/organisations/org-b/reactiver',
        headers: superAdmin(app),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().organisation).toMatchObject({ id: 'org-b', actif: true })
      expect(updates).toContainEqual({ id: 'org-b', actif: true })
    })

    it('organisation inconnue → 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/organisations/inconnue/suspendre',
        headers: superAdmin(app),
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('Forfait — PATCH /platform/organisations/:id/forfait', () => {
    it('SUPER_ADMIN attribue le forfait PRO → 200, forfait mis à jour', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'PRO' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().organisation).toMatchObject({ id: 'org-a', forfait: 'PRO' })
      expect(updates).toContainEqual({ id: 'org-a', forfait: 'PRO' })
    })

    it('forfait hors enum → 400 (validation de schéma)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'PLATINE' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rôle tenant (ADMIN) → 403 (action plateforme)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: adminTenant(app),
        payload: { forfait: 'PRO' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('organisation inconnue → 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/inconnue/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'ENTREPRISE' },
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
