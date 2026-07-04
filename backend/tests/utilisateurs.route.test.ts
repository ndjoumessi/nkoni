import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { Prisma } from '../src/generated/prisma/client'

/**
 * CRUD Utilisateur (§4.5) — réservé ADMIN (matrice §2). Prisma mocké (en mémoire).
 * Couvre : autorisation par rôle, unicité de l'email (409), lien membre (libre / pris /
 * inconnu), désactivation douce, garde-fou anti auto-verrouillage, validation de schéma.
 */

interface StoredUser {
  id: string
  email: string
  role: string
  actif: boolean
  membreId: string | null
}
interface StoredMembre {
  id: string
  nom: string
  prenom: string
  compteUtilisateurId: string | null
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' })
}
function p2025() {
  return new Prisma.PrismaClientKnownRequestError('NotFound', { code: 'P2025', clientVersion: 'test' })
}

function buildMock() {
  const users = new Map<string, StoredUser>()
  const membres = new Map<string, StoredMembre>([
    ['m-free', { id: 'm-free', nom: 'Libre', prenom: 'Marie', compteUtilisateurId: null }],
    ['m-taken', { id: 'm-taken', nom: 'Pris', prenom: 'Paul', compteUtilisateurId: 'u-existant' }],
  ])
  let seq = 0

  const toPublic = (u: StoredUser) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    actif: u.actif,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    membre: u.membreId
      ? {
          id: u.membreId,
          nom: membres.get(u.membreId)?.nom ?? '',
          prenom: membres.get(u.membreId)?.prenom ?? '',
        }
      : null,
  })

  return {
    utilisateur: {
      findMany: async () =>
        [...users.values()].sort((a, b) => a.email.localeCompare(b.email)).map(toPublic),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        if ([...users.values()].some((u) => u.email === data.email)) throw p2002()
        const id = `u-${++seq}`
        const membreId: string | undefined = data.membre?.connect?.id
        const u: StoredUser = { id, email: data.email, role: data.role, actif: true, membreId: membreId ?? null }
        users.set(id, u)
        if (membreId) {
          const m = membres.get(membreId)
          if (m) m.compteUtilisateurId = id
        }
        return toPublic(u)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const u = users.get(where.id)
        if (!u) throw p2025()
        if (data.role !== undefined) u.role = data.role
        if (data.actif !== undefined) u.actif = data.actif
        return toPublic(u)
      },
    },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => {
        const m = membres.get(where.id)
        return m ? { id: m.id, compteUtilisateurId: m.compteUtilisateurId } : null
      },
    },
  }
}

describe('CRUD Utilisateur (ADMIN)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const creer = (payload: object, role = 'ADMIN') =>
    app.inject({ method: 'POST', url: '/utilisateurs', headers: auth(role), payload })

  it('ADMIN peut lister les comptes (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/utilisateurs', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('SECRETAIRE ne peut PAS lister les comptes (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/utilisateurs', headers: auth('SECRETAIRE') })
    expect(res.statusCode).toBe(403)
  })

  it('Sans token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/utilisateurs' })
    expect(res.statusCode).toBe(401)
  })

  it('ADMIN crée un compte (201) sans exposer le passwordHash', async () => {
    const res = await creer({ email: 'sec@nkoni.cm', password: 'motdepasse1', role: 'SECRETAIRE' })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ email: 'sec@nkoni.cm', role: 'SECRETAIRE', actif: true })
    expect(body.passwordHash).toBeUndefined()
  })

  it('Email déjà utilisé → 409', async () => {
    await creer({ email: 'dup@nkoni.cm', password: 'motdepasse1', role: 'TRESORIERE' })
    const res = await creer({ email: 'dup@nkoni.cm', password: 'autrepass1', role: 'PRESIDENT' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: 'Conflict' })
  })

  it('Création liée à un membre libre → 201 + membre rattaché', async () => {
    const res = await creer({
      email: 'lie@nkoni.cm',
      password: 'motdepasse1',
      role: 'MEMBRE_SIMPLE',
      membreId: 'm-free',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().membre).toMatchObject({ id: 'm-free' })
  })

  it('Création liée à un membre déjà rattaché → 409', async () => {
    const res = await creer({
      email: 'lie2@nkoni.cm',
      password: 'motdepasse1',
      role: 'MEMBRE_SIMPLE',
      membreId: 'm-taken',
    })
    expect(res.statusCode).toBe(409)
  })

  it('Création liée à un membre inconnu → 400', async () => {
    const res = await creer({
      email: 'lie3@nkoni.cm',
      password: 'motdepasse1',
      role: 'MEMBRE_SIMPLE',
      membreId: 'm-inconnu',
    })
    expect(res.statusCode).toBe(400)
  })

  it('Rôle invalide → 400 (validation de schéma)', async () => {
    const res = await creer({ email: 'x@nkoni.cm', password: 'motdepasse1', role: 'ROI' })
    expect(res.statusCode).toBe(400)
  })

  it('Mot de passe trop court → 400', async () => {
    const res = await creer({ email: 'y@nkoni.cm', password: 'court', role: 'PRESIDENT' })
    expect(res.statusCode).toBe(400)
  })

  it('TRESORIERE ne peut PAS créer de compte (403)', async () => {
    const res = await creer(
      { email: 'z@nkoni.cm', password: 'motdepasse1', role: 'PRESIDENT' },
      'TRESORIERE',
    )
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN peut désactiver un compte (200, actif=false)', async () => {
    const cree = await creer({ email: 'off@nkoni.cm', password: 'motdepasse1', role: 'PRESIDENT' })
    const id = cree.json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/utilisateurs/${id}`,
      headers: auth('ADMIN'),
      payload: { actif: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ actif: false })
  })

  it('PATCH sur un compte inconnu → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/utilisateurs/nope',
      headers: auth('ADMIN', 'admin-1'),
      payload: { actif: false },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Un ADMIN ne peut pas se désactiver lui-même → 400", async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/utilisateurs/admin-self',
      headers: auth('ADMIN', 'admin-self'),
      payload: { actif: false },
    })
    expect(res.statusCode).toBe(400)
  })
})
