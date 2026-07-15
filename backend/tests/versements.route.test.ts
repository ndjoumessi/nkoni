import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Module financier sensible — vérifie l'invariant montantVerse/montantValorise et
 * l'atomicité (via un $transaction mocké interactif). Prisma entièrement mocké.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOps(target: Record<string, any>, data: Record<string, any>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) target[k] += v.increment
    else if (v && typeof v === 'object' && 'decrement' in v) target[k] -= v.decrement
    else target[k] = v
  }
  return { ...target }
}

function buildMock() {
  // c1 : contribution vierge. c2 : déjà "lissée" par un équilibrage
  // (montantVerse 1000 réel, mais montantValorise 800 car 200 déplacés ailleurs).
  const contributions = new Map<string, Record<string, unknown>>([
    ['c1', { id: 'c1', membreId: 'm-simple', montantVerse: 0, montantValorise: 0 }],
    ['c2', { id: 'c2', membreId: 'm-simple', montantVerse: 1000, montantValorise: 800 }],
    ['c-autre', { id: 'c-autre', membreId: 'm-autre', montantVerse: 0, montantValorise: 0 }],
  ])
  // Rattachement contribution → compte utilisateur du membre (pour le filtrage lecture).
  const compteParContribution: Record<string, string> = {
    c1: 'u-simple',
    c2: 'u-simple',
    'c-autre': 'u-autre',
  }
  const versements = new Map<string, Record<string, unknown>>()
  let seq = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    versement: {
      create: async ({ data }: any) => {
        const id = `v${++seq}`
        const v = { id, ...data }
        versements.set(id, v)
        return { ...v }
      },
      findUnique: async ({ where }: any) => {
        const v = versements.get(where.id)
        return v ? { ...v } : null
      },
      update: async ({ where, data }: any) => applyOps(versements.get(where.id)!, data),
      delete: async ({ where }: any) => {
        const v = versements.get(where.id)!
        versements.delete(where.id)
        return v
      },
      findMany: async ({ where }: any) => {
        let res = [...versements.values()]
        if (where?.contributionId) res = res.filter((v) => v.contributionId === where.contributionId)
        const compte = where?.contribution?.membre?.compteUtilisateurId
        if (compte) {
          res = res.filter((v) => compteParContribution[v.contributionId as string] === compte)
        }
        return res
      },
    },
    contribution: {
      update: async ({ where, data }: any) => applyOps(contributions.get(where.id)!, data),
    },
    membre: {
      findMany: async () => [],
      findUnique: async () => null,
    },
    // Aucun reçu émis par défaut → la suppression de versement n'est pas bloquée (garde M3).
    recu: {
      findFirst: async () => null,
    },
    // $transaction interactif : passe le mock lui-même comme tx.
    $transaction: async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  }

  return { prisma, contributions, versements }
}

describe('CRUD Versement — module financier', () => {
  let app: FastifyInstance
  let store: ReturnType<typeof buildMock>

  beforeEach(async () => {
    store = buildMock()
    app = await buildApp({ prisma: store.prisma, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const post = (role: string, payload: unknown) =>
    app.inject({ method: 'POST', url: '/versements', headers: auth(role), payload })

  it('TRESORIERE : POST versement incrémente montantVerse ET montantValorise (contribution vierge)', async () => {
    const res = await post('TRESORIERE', {
      contributionId: 'c1',
      montant: 500,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    expect(res.statusCode).toBe(201)
    const { contribution } = res.json()
    expect(contribution.montantVerse).toBe(500)
    expect(contribution.montantValorise).toBe(500)
  })

  it('INVARIANT : le versement INCRÉMENTE montantValorise (n’écrase pas un équilibrage antérieur)', async () => {
    // c2 : montantVerse 1000, montantValorise 800 (équilibrage a déplacé 200).
    const res = await post('ADMIN', {
      contributionId: 'c2',
      montant: 300,
      dateVersement: '2025-06-01',
      mode: 'TIERS',
    })
    expect(res.statusCode).toBe(201)
    const { contribution } = res.json()
    expect(contribution.montantVerse).toBe(1300) // 1000 + 300
    expect(contribution.montantValorise).toBe(1100) // 800 + 300 (PAS remis à 1300)
  })

  it('SECRETAIRE ne peut pas créer un versement (403)', async () => {
    const res = await post('SECRETAIRE', {
      contributionId: 'c1',
      montant: 100,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    expect(res.statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE ne peut pas créer un versement (403)', async () => {
    const res = await post('MEMBRE_SIMPLE', {
      contributionId: 'c1',
      montant: 100,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    expect(res.statusCode).toBe(403)
  })

  it('PATCH versement : le delta de montant se reporte sur montantVerse ET montantValorise', async () => {
    const created = await post('TRESORIERE', {
      contributionId: 'c1',
      montant: 500,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    const versementId = created.json().versement.id

    const res = await app.inject({
      method: 'PATCH',
      url: `/versements/${versementId}`,
      headers: auth('TRESORIERE'),
      payload: { montant: 800 }, // +300
    })
    expect(res.statusCode).toBe(200)
    // c1 : 500 → 800 (+300) des deux côtés.
    expect(store.contributions.get('c1')).toMatchObject({
      montantVerse: 800,
      montantValorise: 800,
    })
  })

  it('DELETE versement : décrémente montantVerse ET montantValorise', async () => {
    const created = await post('TRESORIERE', {
      contributionId: 'c1',
      montant: 500,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    const versementId = created.json().versement.id

    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementId}`,
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(204)
    expect(store.contributions.get('c1')).toMatchObject({
      montantVerse: 0,
      montantValorise: 0,
    })
  })

  it('DELETE versement AVEC reçu émis → 409 (intégrité M3, aucune suppression)', async () => {
    const created = await post('TRESORIERE', {
      contributionId: 'c1',
      montant: 500,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    const versementId = created.json().versement.id
    // Un reçu existe pour ce versement → la suppression doit être refusée.
    store.prisma.recu.findFirst = async () => ({ id: 'r1' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementId}`,
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(409)
    // Le versement est toujours là et les compteurs inchangés (rien décrémenté).
    expect(store.versements.get(versementId)).toBeDefined()
    expect(store.contributions.get('c1')).toMatchObject({ montantVerse: 500, montantValorise: 500 })
  })

  it('DELETE versement inexistant → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/versements/inconnu',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(404)
  })

  it('MEMBRE_SIMPLE en lecture ne voit que les versements de SES contributions', async () => {
    // Deux versements : un sur c1 (compte u-simple), un sur c-autre (u-autre).
    await post('TRESORIERE', {
      contributionId: 'c1',
      montant: 100,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })
    await post('TRESORIERE', {
      contributionId: 'c-autre',
      montant: 200,
      dateVersement: '2025-06-01',
      mode: 'ESPECES',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/versements',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].contributionId).toBe('c1')
  })
})
