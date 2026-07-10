import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { Prisma } from '../src/generated/prisma/client'
import { estConflitIdempotence } from '../src/lib/idempotence'

/**
 * Idempotence (§ PWA hors-ligne) : un rejeu de la MÊME mutation (en-tête `Idempotence-Key`) ne
 * crée pas de doublon — il renvoie la ligne déjà appliquée (200). Prisma mocké.
 *
 * Durcissement P2002 : le re-fetch par `idempotenceKey` n'est déclenché QUE si le P2002 vient
 * bien de l'unique (organisationId, idempotenceKey) ; un P2002 sur une autre contrainte est
 * RELEVÉ (pas avalé), sinon on renverrait la mauvaise ligne ou null.
 */

/** Fabrique un P2002 Prisma ciblant `target` (nom de contrainte ou liste de champs). */
function p2002(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMock(opts: { versementCreateError?: unknown; membreCreateError?: unknown } = {}) {
  const versements = new Map<string, any>()
  const membres = new Map<string, any>()
  const compteur = { versementCreate: 0, membreCreate: 0, versementFindFirst: 0, membreFindFirst: 0 }
  const prisma: any = {
    versement: {
      findFirst: async ({ where }: any) => {
        compteur.versementFindFirst++
        return [...versements.values()].find((v) => v.idempotenceKey === where.idempotenceKey) ?? null
      },
      create: async ({ data }: any) => {
        if (opts.versementCreateError) throw opts.versementCreateError
        compteur.versementCreate++
        const v = { id: `v${compteur.versementCreate}`, ...data }
        if (data.idempotenceKey) versements.set(data.idempotenceKey, v)
        return v
      },
    },
    contribution: {
      update: async ({ where }: any) => ({ id: where.id, membreId: 'm1', annee: 2026, montantVerse: 0, montantValorise: 0 }),
      findUnique: async ({ where }: any) => ({ id: where.id, membreId: 'm1', annee: 2026 }),
    },
    membre: {
      count: async () => membres.size,
      findUnique: async () => null, // notifierVersement (best-effort) → pas de destinataire
      findFirst: async ({ where }: any) => {
        compteur.membreFindFirst++
        return [...membres.values()].find((m) => m.idempotenceKey === where.idempotenceKey) ?? null
      },
      create: async ({ data }: any) => {
        if (opts.membreCreateError) throw opts.membreCreateError
        compteur.membreCreate++
        const m = { id: `m${compteur.membreCreate}`, ...data }
        if (data.idempotenceKey) membres.set(data.idempotenceKey, m)
        return m
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  }
  return { prisma, compteur }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Idempotence des mutations hors-ligne', () => {
  let app: FastifyInstance
  let compteur: { versementCreate: number; membreCreate: number }
  const auth = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'TRESORIERE' })}` })
  const authAdmin = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'ADMIN' })}` })

  beforeEach(async () => {
    const m = buildMock()
    compteur = m.compteur
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: m.prisma as any, logger: false })
    await app.ready()
  })
  afterEach(async () => app.close())

  it('POST /versements : 2 rejeus de la même clé → 1 seule création, 2ᵉ renvoie l’existant (200)', async () => {
    const payload = { contributionId: 'c1', montant: 5_000, dateVersement: '2026-06-01', mode: 'ESPECES' }
    const headers = { ...auth(), 'idempotence-key': 'uuid-abc' }

    const r1 = await app.inject({ method: 'POST', url: '/versements', headers, payload })
    expect(r1.statusCode).toBe(201)
    const id1 = r1.json().versement.id

    const r2 = await app.inject({ method: 'POST', url: '/versements', headers, payload })
    expect(r2.statusCode).toBe(200)
    expect(r2.json().versement.id).toBe(id1)

    expect(compteur.versementCreate).toBe(1) // pas de doublon
  })

  it('POST /versements sans clé → chaque appel crée (pas d’idempotence imposée)', async () => {
    const payload = { contributionId: 'c1', montant: 5_000, dateVersement: '2026-06-01', mode: 'ESPECES' }
    await app.inject({ method: 'POST', url: '/versements', headers: auth(), payload })
    await app.inject({ method: 'POST', url: '/versements', headers: auth(), payload })
    expect(compteur.versementCreate).toBe(2)
  })

  it('POST /membres : 2 rejeus de la même clé → 1 seule création, 2ᵉ renvoie l’existant (200)', async () => {
    const payload = { nom: 'Tchoupa', prenom: 'Bernard', anneeAdhesion: 2020 }
    const headers = { ...authAdmin(), 'idempotence-key': 'uuid-m-1' }

    const r1 = await app.inject({ method: 'POST', url: '/membres', headers, payload })
    expect(r1.statusCode).toBe(201)
    const id1 = r1.json().id

    const r2 = await app.inject({ method: 'POST', url: '/membres', headers, payload })
    expect(r2.statusCode).toBe(200)
    expect(r2.json().id).toBe(id1)

    expect(compteur.membreCreate).toBe(1)
  })
})

describe('estConflitIdempotence (pure) — ne cible QUE l’unique (organisationId, idempotenceKey)', () => {
  it('P2002 dont target CONTIENT idempotenceKey (liste OU nom de contrainte) → true', () => {
    expect(estConflitIdempotence(p2002(['organisationId', 'idempotenceKey']))).toBe(true)
    expect(estConflitIdempotence(p2002('Versement_organisationId_idempotenceKey_key'))).toBe(true)
  })

  it('P2002 sur une AUTRE contrainte → false', () => {
    expect(estConflitIdempotence(p2002(['membreId', 'annee']))).toBe(false)
    expect(estConflitIdempotence(p2002('Contribution_membreId_annee_key'))).toBe(false)
    expect(estConflitIdempotence(p2002(undefined as unknown as string))).toBe(false) // target absente
  })

  it('erreur non-P2002 (ou pas une erreur Prisma) → false', () => {
    expect(
      estConflitIdempotence(
        new Prisma.PrismaClientKnownRequestError('nope', {
          code: 'P2025',
          clientVersion: 'test',
          meta: { target: ['idempotenceKey'] },
        }),
      ),
    ).toBe(false)
    expect(estConflitIdempotence(new Error('boom'))).toBe(false)
  })
})

describe('Durcissement P2002 : une AUTRE contrainte est propagée, pas avalée', () => {
  const signer = (role: string) => (app: FastifyInstance) =>
    `Bearer ${app.jwt.sign({ sub: 'u1', role })}`

  it('POST /membres : P2002 sur une autre contrainte → propagé (500), pas de re-fetch idempotent', async () => {
    const m = buildMock({ membreCreateError: p2002(['organisationId', 'telephone']) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = await buildApp({ prisma: m.prisma as any, logger: false })
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/membres',
      headers: { authorization: signer('ADMIN')(app), 'idempotence-key': 'uuid-m-x' },
      payload: { nom: 'X', prenom: 'Y', anneeAdhesion: 2020 },
    })
    expect(res.statusCode).toBe(500) // erreur relevée par Fastify, pas transformée en 200
    expect(m.compteur.membreFindFirst).toBe(1) // uniquement le pré-check ; PAS de re-fetch post-P2002
    await app.close()
  })

  it('POST /versements : P2002 sur une autre contrainte → propagé (500), pas de re-fetch idempotent', async () => {
    const m = buildMock({ versementCreateError: p2002('Versement_autre_unique_key') })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = await buildApp({ prisma: m.prisma as any, logger: false })
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/versements',
      headers: { authorization: signer('TRESORIERE')(app), 'idempotence-key': 'uuid-v-x' },
      payload: { contributionId: 'c1', montant: 5_000, dateVersement: '2026-06-01', mode: 'ESPECES' },
    })
    expect(res.statusCode).toBe(500)
    expect(m.compteur.versementFindFirst).toBe(1) // pré-check seulement, pas de re-fetch post-P2002
    await app.close()
  })
})
