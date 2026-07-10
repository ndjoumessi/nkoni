import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Idempotence (§ PWA hors-ligne) : un rejeu de la MÊME mutation (en-tête `Idempotence-Key`) ne
 * crée pas de doublon — il renvoie la ligne déjà appliquée (200). Prisma mocké.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMock() {
  const versements = new Map<string, any>()
  const membres = new Map<string, any>()
  const compteur = { versementCreate: 0, membreCreate: 0 }
  const prisma: any = {
    versement: {
      findFirst: async ({ where }: any) =>
        [...versements.values()].find((v) => v.idempotenceKey === where.idempotenceKey) ?? null,
      create: async ({ data }: any) => {
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
      findFirst: async ({ where }: any) =>
        [...membres.values()].find((m) => m.idempotenceKey === where.idempotenceKey) ?? null,
      create: async ({ data }: any) => {
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
