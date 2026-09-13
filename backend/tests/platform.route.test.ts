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
      forfaitExpireLe: null as Date | null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'org-b',
      nom: 'Amicale X',
      devise: 'EUR',
      langueDefaut: 'FR',
      actif: true,
      forfait: 'GRATUIT',
      forfaitExpireLe: null as Date | null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: { id: string; [k: string]: any }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformAudits: any[] = []
  /** `forcerConflit` simule une échéance modifiée entre la lecture et l'écriture conditionnelle. */
  const etat = { forcerConflit: false }
  const prisma: any = {
    organisation: {
      findMany: async () => orgs.map((o) => ({ ...o })),
      // Lu par le handler forfait (ancien forfait pour le snapshot d'audit) : `null` si id inconnu.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => {
        const org = orgs.find((o) => o.id === where.id)
        return org ? { ...org } : null
      },
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
      // Écriture CONDITIONNELLE de la prolongation : ne s'applique que si l'échéance lue n'a pas bougé
      // NI le forfait (une course avec un passage en GRATUIT ne doit jamais écraser l'effacement).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: async ({ where, data }: any) => {
        const org = orgs.find((o) => o.id === where.id)
        const lue = where.forfaitExpireLe === null ? null : where.forfaitExpireLe.getTime()
        const actuelle = org?.forfaitExpireLe ? org.forfaitExpireLe.getTime() : null
        if (!org || etat.forcerConflit || lue !== actuelle || where.forfait !== org.forfait) return { count: 0 }
        Object.assign(org, data)
        updates.push({ id: where.id, ...data })
        return { count: 1 }
      },
    },
    membre: {
      // groupBy : org-a a 3 membres, org-b en a 1.
      groupBy: async () => [
        { organisationId: 'org-a', _count: { _all: 3 } },
        { organisationId: 'org-b', _count: { _all: 1 } },
      ],
    },
    // Journal d'audit PLATEFORME : chaque action journalise (best-effort ici).
    utilisateur: { findUnique: async () => ({ email: 'super-admin@nkoni.test' }) },
    platformAuditLog: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (a: any) => (platformAudits.push(a.data), { id: 'pa-1', ...a.data }),
    },
  }
  return { prisma, updates, platformAudits, orgs, etat }
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

  let mock: ReturnType<typeof buildMock>

  beforeEach(async () => {
    mock = buildMock()
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

  describe('Échéance — vues plateforme (spec 1.1)', () => {
    const orgA = () => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (!org) throw new Error('org-a absente du mock')
      return org
    }

    it('la liste porte l’état CALCULÉ et le forfait EFFECTIF', async () => {
      orgA().forfait = 'PRO'
      orgA().forfaitExpireLe = new Date('2020-01-01T22:59:59.999Z') // expirée depuis longtemps
      const res = await app.inject({ method: 'GET', url: '/platform/organisations', headers: superAdmin(app) })
      expect(res.statusCode).toBe(200)
      const vue = res.json().organisations.find((o: { id: string }) => o.id === 'org-a')
      expect(vue).toMatchObject({
        forfait: 'PRO',
        forfaitExpireLe: '2020-01-01T22:59:59.999Z',
        etatForfait: 'EXPIRE',
        forfaitEffectif: 'GRATUIT',
      })
    })

    it('repasser en GRATUIT efface l’échéance', async () => {
      orgA().forfait = 'PRO'
      orgA().forfaitExpireLe = new Date('2030-01-01T22:59:59.999Z')
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'GRATUIT' },
      })
      expect(res.statusCode).toBe(200)
      expect(updates).toContainEqual({ id: 'org-a', forfait: 'GRATUIT', forfaitExpireLe: null })
      expect(res.json().organisation).toMatchObject({
        forfait: 'GRATUIT',
        forfaitExpireLe: null,
        etatForfait: 'SANS_ECHEANCE',
      })
    })

    it('repasser en GRATUIT : la trace CHANGER_FORFAIT montre l’échéance EFFACÉE', async () => {
      orgA().forfait = 'PRO'
      orgA().forfaitExpireLe = new Date('2030-01-01T22:59:59.999Z')
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'GRATUIT' },
      })
      expect(res.statusCode).toBe(200)
      expect(mock.platformAudits).toHaveLength(1)
      expect(mock.platformAudits[0]).toMatchObject({
        action: 'CHANGER_FORFAIT',
        donneesAvant: { forfait: 'PRO', forfaitExpireLe: '2030-01-01T22:59:59.999Z' },
        donneesApres: { forfait: 'GRATUIT', forfaitExpireLe: null },
      })
    })
  })

  describe('Prolongation — POST /platform/organisations/:id/forfait/prolonger', () => {
    const prolonger = (payload: Record<string, unknown>, id = 'org-a', entetes = superAdmin(app)) =>
      app.inject({ method: 'POST', url: `/platform/organisations/${id}/forfait/prolonger`, headers: entetes, payload })

    beforeEach(() => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (!org) throw new Error('org-a absente du mock')
      org.forfait = 'PRO'
      org.forfaitExpireLe = null
    })

    it('aperçu : calcule la nouvelle échéance SANS rien écrire ni journaliser', async () => {
      const res = await prolonger({ mois: 3, apercu: true })
      expect(res.statusCode).toBe(200)
      expect(res.json().nouvelleEcheance).toMatch(/T22:59:59\.999Z$/) // fin de journée Douala
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('écriture : écrit EXACTEMENT la date annoncée par l’aperçu, et journalise', async () => {
      const apercu = (await prolonger({ mois: 12, apercu: true })).json()
      const res = await prolonger({
        mois: 12,
        apercu: false,
        echeanceAttendue: apercu.echeanceActuelle,
        nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().nouvelleEcheance).toBe(apercu.nouvelleEcheance)
      expect(updates).toHaveLength(1)
      expect(updates[0]?.forfaitExpireLe.toISOString()).toBe(apercu.nouvelleEcheance)
      expect(res.json().organisation).toMatchObject({ forfaitExpireLe: apercu.nouvelleEcheance, etatForfait: 'ACTIF' })
      expect(mock.platformAudits).toHaveLength(1)
      expect(mock.platformAudits[0]).toMatchObject({
        action: 'PROLONGER_FORFAIT',
        organisationCibleId: 'org-a',
        donneesAvant: { forfait: 'PRO', forfaitExpireLe: null },
        donneesApres: { forfaitExpireLe: apercu.nouvelleEcheance, mois: 12 },
      })
    })

    it('echeanceAttendue périmée (≠ échéance relue) → 409, écriture NON appelée', async () => {
      const apercu = (await prolonger({ mois: 1, apercu: true })).json()
      const res = await prolonger({
        mois: 1,
        apercu: false,
        echeanceAttendue: '2020-01-01T00:00:00.000Z',
        nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
      })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('nouvelleEcheanceAttendue différente de celle recalculée → 409, écriture NON appelée', async () => {
      const apercu = (await prolonger({ mois: 1, apercu: true })).json()
      const res = await prolonger({
        mois: 1,
        apercu: false,
        echeanceAttendue: apercu.echeanceActuelle,
        nouvelleEcheanceAttendue: '2099-01-01T00:00:00.000Z',
      })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('apercu absent → 400 (schéma), écriture NON appelée', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/platform/organisations/org-a/forfait/prolonger',
        headers: superAdmin(app),
        payload: { mois: 1 },
      })
      expect(res.statusCode).toBe(400)
      expect(updates).toHaveLength(0)
    })

    it('apercu:false sans valeurs attendues → 400, écriture NON appelée', async () => {
      const res = await prolonger({ mois: 1, apercu: false })
      expect(res.statusCode).toBe(400)
      expect(updates).toHaveLength(0)
    })

    it('forfait GRATUIT → 409, rien d’écrit', async () => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (org) org.forfait = 'GRATUIT'
      const res = await prolonger({ mois: 1, apercu: true })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
    })

    it('échéance modifiée ENTRE la lecture et l’écriture (course DB) → 409, rien d’écrit ni journalisé', async () => {
      const apercu = (await prolonger({ mois: 1, apercu: true })).json()
      mock.etat.forcerConflit = true
      const res = await prolonger({
        mois: 1,
        apercu: false,
        echeanceAttendue: apercu.echeanceActuelle,
        nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
      })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('organisation inconnue → 404', async () => {
      expect((await prolonger({ mois: 1, apercu: true }, 'org-inconnue')).statusCode).toBe(404)
    })

    it('durée hors liste (2 mois) → 400', async () => {
      expect((await prolonger({ mois: 2, apercu: true })).statusCode).toBe(400)
    })

    it('rôle tenant (ADMIN) → 403', async () => {
      expect((await prolonger({ mois: 1, apercu: true }, 'org-a', adminTenant(app))).statusCode).toBe(403)
    })
  })
})
