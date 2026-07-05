import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Auto-inscription (§3.1) — POST /organisations/inscription (public).
 * Prisma mocké. Vérifie : création atomique org + admin, auto-login (JWT scopé sur la
 * nouvelle org), email déjà utilisé (409 générique), validation des champs.
 * Nécessite JWT_ACCESS_SECRET / JWT_REFRESH_SECRET dans l'environnement (.env).
 */

function buildMock(opts: { emailExists?: boolean } = {}) {
  const created: { org?: Record<string, unknown>; admin?: Record<string, unknown> } = {}
  let seq = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    utilisateur: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) =>
        opts.emailExists && where.email ? { id: 'existing' } : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const admin = {
          id: `u${++seq}`,
          email: data.email,
          role: data.role,
          organisationId: data.organisationId,
        }
        created.admin = { ...admin, passwordHash: data.passwordHash }
        return admin
      },
    },
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        const org = {
          id: `org${++seq}`,
          nom: data.nom,
          devise: data.devise,
          langueDefaut: data.langueDefaut,
        }
        created.org = org
        return org
      },
    },
    // $transaction interactif : passe le mock lui-même comme tx.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(prisma),
  }
  return { prisma, created }
}

const inscriptionValide = {
  nomOrganisation: 'Famille Test',
  devise: 'FCFA',
  langue: 'FR',
  email: 'fondateur@test.local',
  password: 'motdepasse8',
}

async function appAvec(prisma: unknown): Promise<FastifyInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = await buildApp({ prisma: prisma as any, logger: false })
  await app.ready()
  return app
}

describe('Auto-inscription — POST /organisations/inscription', () => {
  it('inscription valide → 201, org + admin créés (atomique), auto-login scopé sur la nouvelle org', async () => {
    const { prisma, created } = buildMock()
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/organisations/inscription',
      payload: inscriptionValide,
    })
    expect(res.statusCode).toBe(201)

    // Organisation créée avec devise/langue fournies.
    expect(created.org).toMatchObject({ nom: 'Famille Test', devise: 'FCFA', langueDefaut: 'FR' })
    // Admin ADMIN rattaché à CETTE organisation (créés dans la même transaction).
    expect(created.admin).toMatchObject({ role: 'ADMIN', email: 'fondateur@test.local' })
    expect(created.admin?.['organisationId']).toBe(created.org?.['id'])
    // passwordHash présent (hashé), jamais le mot de passe en clair.
    expect(created.admin?.['passwordHash']).toBeTypeOf('string')
    expect(created.admin?.['passwordHash']).not.toBe('motdepasse8')

    // Réponse : accessToken + user (sans passwordHash), cookie refresh posé.
    const body = res.json()
    expect(typeof body.accessToken).toBe('string')
    expect(body.user).toMatchObject({ email: 'fondateur@test.local', role: 'ADMIN' })
    expect(res.cookies.find((c) => c.name === 'nkoni_refresh')).toBeTruthy()

    // Le JWT émis porte le rôle ADMIN ET l'organisationId de la nouvelle org (isolation §2.2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = app.jwt.decode(body.accessToken) as any
    expect(claims.role).toBe('ADMIN')
    expect(claims.organisationId).toBe(created.org?.['id'])

    await app.close()
  })

  it('email déjà utilisé → 409 (message générique, pas de révélation)', async () => {
    const { prisma } = buildMock({ emailExists: true })
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/organisations/inscription',
      payload: inscriptionValide,
    })
    expect(res.statusCode).toBe(409)
    // Message générique : ne dit pas « email déjà pris » explicitement.
    expect(res.json().message).not.toMatch(/déjà|existe|pris/i)
    await app.close()
  })

  it('validation : devise hors enum, email invalide, mot de passe trop court, champ manquant → 400', async () => {
    const { prisma } = buildMock()
    const app = await appAvec(prisma)
    const cas = [
      { ...inscriptionValide, devise: 'GBP' }, // devise hors enum
      { ...inscriptionValide, langue: 'ES' }, // langue hors enum
      { ...inscriptionValide, email: 'pas-un-email' }, // email invalide
      { ...inscriptionValide, password: 'court' }, // < 8 caractères
      { ...inscriptionValide, nomOrganisation: '' }, // nom vide
      { devise: 'FCFA', langue: 'FR', email: 'a@b.co', password: 'motdepasse8' }, // nom manquant
    ]
    for (const payload of cas) {
      const res = await app.inject({ method: 'POST', url: '/organisations/inscription', payload })
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
    await app.close()
  })
})
