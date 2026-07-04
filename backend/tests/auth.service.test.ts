import { describe, it, expect, beforeAll } from 'vitest'
import {
  verifyCredentials,
  findUserById,
  hashPassword,
  type AuthPrisma,
} from '../src/services/auth.service'

/**
 * Tests de la logique d'auth avec un Prisma MOCKÉ (aucune DB).
 */

// Fabrique un faux Prisma dont findUnique renvoie `record`.
function prismaReturning(record: Record<string, unknown> | null): AuthPrisma {
  return { utilisateur: { findUnique: async () => record } }
}

describe('auth.service', () => {
  let hash: string
  beforeAll(async () => {
    hash = await hashPassword('correct-horse-battery')
  })

  it('verifyCredentials : retourne l’utilisateur si le mot de passe est correct', async () => {
    const prisma = prismaReturning({
      id: 'u1',
      email: 'a@b.c',
      role: 'ADMIN',
      actif: true,
      passwordHash: hash,
      membre: { id: 'm1' },
    })

    const user = await verifyCredentials(prisma, 'a@b.c', 'correct-horse-battery')

    expect(user).not.toBeNull()
    expect(user).toMatchObject({
      id: 'u1',
      email: 'a@b.c',
      role: 'ADMIN',
      membreId: 'm1',
      actif: true,
    })
  })

  it('verifyCredentials : retourne null si le mot de passe est faux', async () => {
    const prisma = prismaReturning({
      id: 'u1',
      email: 'a@b.c',
      role: 'ADMIN',
      actif: true,
      passwordHash: hash,
      membre: null,
    })

    const user = await verifyCredentials(prisma, 'a@b.c', 'mauvais-mot-de-passe')
    expect(user).toBeNull()
  })

  it('verifyCredentials : retourne null si l’email est inconnu (anti-énumération)', async () => {
    const prisma = prismaReturning(null)
    const user = await verifyCredentials(prisma, 'inconnu@x.y', 'peu-importe')
    expect(user).toBeNull()
  })

  it('verifyCredentials : membreId = null si le compte n’est lié à aucun membre', async () => {
    const prisma = prismaReturning({
      id: 'u2',
      email: 'sans@membre.c',
      role: 'TRESORIERE',
      actif: true,
      passwordHash: hash,
      membre: null,
    })
    const user = await verifyCredentials(prisma, 'sans@membre.c', 'correct-horse-battery')
    expect(user?.membreId).toBeNull()
  })

  it('findUserById : retourne l’utilisateur ou null', async () => {
    const found = await findUserById(
      prismaReturning({
        id: 'u3',
        email: 'c@d.e',
        role: 'MEMBRE_SIMPLE',
        actif: true,
        membre: { id: 'm3' },
      }),
      'u3',
    )
    expect(found).toMatchObject({ id: 'u3', role: 'MEMBRE_SIMPLE', membreId: 'm3' })

    const missing = await findUserById(prismaReturning(null), 'nope')
    expect(missing).toBeNull()
  })

  it('hashPassword : produit un hash argon2 vérifiable et différent du clair', async () => {
    const h = await hashPassword('s3cret')
    expect(h).not.toBe('s3cret')
    expect(h.startsWith('$argon2')).toBe(true)
  })
})
