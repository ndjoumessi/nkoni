import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Journal d'audit PLATEFORME (dette 0.3) au niveau HTTP — Prisma mocké.
 *
 * Vérifie que chaque action du SUPER_ADMIN écrit une entrée `PlatformAuditLog` avec le bon
 * `avant → après`, que l'écriture BEST-EFFORT ne fait jamais échouer l'action, et que la vue
 * « Historique » (GET /platform/audit-log) filtre et borne. La PURGE (fail-closed) est couverte
 * par `platform-purge.route.test.ts`. Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (.env).
 */

const ORG = 'org-a'
const NOM = 'WAMBA TCHOUPA'

function matche(where: any = {}, row: any): boolean {
  if (where.action && row.action !== where.action) return false
  if (where.organisationCibleId && row.organisationCibleId !== where.organisationCibleId) return false
  return true
}

function buildMock(opts: { auditThrows?: boolean; auditRows?: any[] } = {}) {
  const audits: any[] = []
  const updates: any[] = []
  const org: any = {
    id: ORG,
    nom: NOM,
    devise: 'FCFA',
    langueDefaut: 'FR',
    actif: true,
    forfait: 'GRATUIT',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
  const rows = opts.auditRows ?? []

  const modele = (nom: string) => ({
    findMany: async () => (nom === 'Utilisateur' ? [{ id: 'u1' }] : []),
    findFirst: async () => null,
    count: async () => 0,
  })

  const prisma: any = new Proxy(
    {
      organisation: {
        findUnique: async ({ where }: any) => (where.id === ORG ? { ...org } : null),
        update: async ({ where, data }: any) => {
          if (where.id !== ORG) throw Object.assign(new Error('not found'), { code: 'P2025' })
          Object.assign(org, data)
          updates.push({ id: where.id, ...data })
          return { ...org }
        },
        findMany: async () => [{ ...org }],
      },
      // `findMany` OBLIGATOIRE en plus de `groupBy` : l'entrée explicite masque le fallback du
      // Proxy, or `assemblerExportOrganisation` lit `membre.findMany` (export EXPORTER/PURGER).
      membre: {
        groupBy: async () => [{ organisationId: ORG, _count: { _all: 2 } }],
        findMany: async () => [],
      },
      utilisateur: {
        findUnique: async () => ({ email: 'super-admin@nkoni.test' }),
        findMany: async () => [{ id: 'u1' }],
      },
      platformAuditLog: {
        create: async (a: any) => {
          if (opts.auditThrows) throw new Error('audit down')
          audits.push(a.data)
          return { id: `pa-${audits.length}`, ...a.data }
        },
        count: async ({ where }: any = {}) => rows.filter((r) => matche(where, r)).length,
        findMany: async ({ where, take }: any = {}) =>
          rows.filter((r) => matche(where, r)).slice(0, take ?? rows.length),
      },
    },
    {
      get(cible: any, prop: string) {
        if (prop in cible) return cible[prop]
        return modele(prop.charAt(0).toUpperCase() + prop.slice(1))
      },
    },
  )

  return { prisma, audits, updates }
}

const superAdmin = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'sa-1', role: 'SUPER_ADMIN' })}`,
})

async function appAvec(mock: ReturnType<typeof buildMock>): Promise<FastifyInstance> {
  const app = await buildApp({ prisma: mock.prisma, logger: false })
  await app.ready()
  return app
}

describe('Journal d’audit plateforme — écriture par action', () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  it('SUSPENDRE journalise { actif:true } → { actif:false }', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'POST',
      url: `/platform/organisations/${ORG}/suspendre`,
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200)
    expect(mock.audits).toHaveLength(1)
    expect(mock.audits[0]).toMatchObject({
      action: 'SUSPENDRE',
      acteurEmail: 'super-admin@nkoni.test',
      organisationCibleId: ORG,
      organisationNom: NOM,
      donneesAvant: { actif: true },
      donneesApres: { actif: false },
    })
  })

  it('REACTIVER journalise { actif:false } → { actif:true }', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'POST',
      url: `/platform/organisations/${ORG}/reactiver`,
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200)
    expect(mock.audits[0]).toMatchObject({
      action: 'REACTIVER',
      donneesAvant: { actif: false },
      donneesApres: { actif: true },
    })
  })

  it('CHANGER_FORFAIT journalise l’ancien → le nouveau forfait', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'PATCH',
      url: `/platform/organisations/${ORG}/forfait`,
      headers: superAdmin(app),
      payload: { forfait: 'PRO' },
    })
    expect(res.statusCode).toBe(200)
    expect(mock.audits[0]).toMatchObject({
      action: 'CHANGER_FORFAIT',
      donneesAvant: { forfait: 'GRATUIT' },
      donneesApres: { forfait: 'PRO' },
    })
  })

  it('EXPORTER journalise le VOLUME exporté (nbEnregistrements)', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'GET',
      url: `/platform/organisations/${ORG}/export`,
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200)
    expect(mock.audits).toHaveLength(1)
    expect(mock.audits[0].action).toBe('EXPORTER')
    expect(mock.audits[0].donneesApres).toHaveProperty('nbEnregistrements')
  })

  it('BEST-EFFORT : une écriture de trace en échec ne fait PAS échouer l’action', async () => {
    const mock = buildMock({ auditThrows: true })
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'POST',
      url: `/platform/organisations/${ORG}/suspendre`,
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200) // l'action a bien eu lieu
    expect(mock.updates).toEqual([{ id: ORG, actif: false }])
    expect(mock.audits).toHaveLength(0) // la trace a échoué, silencieusement signalée
  })
})

describe('GET /platform/audit-log — vue Historique', () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  const rows = [
    { id: 'e1', action: 'SUSPENDRE', organisationCibleId: 'org-a', acteurEmail: 'sa@n', dateAction: new Date() },
    { id: 'e2', action: 'CHANGER_FORFAIT', organisationCibleId: 'org-a', acteurEmail: 'sa@n', dateAction: new Date() },
    { id: 'e3', action: 'SUSPENDRE', organisationCibleId: 'org-b', acteurEmail: 'sa@n', dateAction: new Date() },
  ]

  it('sans filtre : renvoie tout + total + tronque=false', async () => {
    app = await appAvec(buildMock({ auditRows: rows }))
    const res = await app.inject({ method: 'GET', url: '/platform/audit-log', headers: superAdmin(app) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(3)
    expect(body.total).toBe(3)
    expect(body.tronque).toBe(false)
  })

  it('filtre par action', async () => {
    app = await appAvec(buildMock({ auditRows: rows }))
    const res = await app.inject({
      method: 'GET',
      url: '/platform/audit-log?action=SUSPENDRE',
      headers: superAdmin(app),
    })
    expect(res.json().items.map((r: any) => r.id)).toEqual(['e1', 'e3'])
  })

  it('filtre par organisation ciblée', async () => {
    app = await appAvec(buildMock({ auditRows: rows }))
    const res = await app.inject({
      method: 'GET',
      url: '/platform/audit-log?organisationCibleId=org-b',
      headers: superAdmin(app),
    })
    expect(res.json().items.map((r: any) => r.id)).toEqual(['e3'])
  })

  it('refusé hors SUPER_ADMIN → 403', async () => {
    app = await appAvec(buildMock())
    const res = await app.inject({
      method: 'GET',
      url: '/platform/audit-log',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'u-1', role: 'ADMIN', organisationId: ORG })}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
