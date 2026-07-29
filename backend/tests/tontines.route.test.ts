import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Tontine (§ tontine). Prisma mocké. Verrouille : gardes (config = matrice `Tontine` ; flux d'argent
 * = requireRoles ADMIN/PRESIDENT/TRESORIERE), génération des tours + bénéficiaires en ORDRE_FIXE,
 * tirage en TIRAGE (et son refus hors TIRAGE), calcul du pot au reversement.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}
const auth = (app: FastifyInstance, role: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role, organisationId: 'org-1' })}`,
})

describe('Tontine — configuration (matrice)', () => {
  it('POST /tontines par MEMBRE_SIMPLE → 403', async () => {
    const app = await appAvec({})
    const res = await app.inject({
      method: 'POST',
      url: '/tontines',
      headers: auth(app, 'MEMBRE_SIMPLE'),
      payload: { nom: 'T', montantBaseMise: 5000 },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('POST /tontines par ADMIN → 201', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = { tontine: { create: async ({ data }: any) => ({ id: 't1', ...data }) } }
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/tontines',
      headers: auth(app, 'ADMIN'),
      payload: { nom: 'Tontine A', montantBaseMise: 5000, modeRotation: 'ORDRE_FIXE' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ id: 't1', nom: 'Tontine A', montantBaseMise: 5000 })
    await app.close()
  })

  it('ouvrir un cycle ORDRE_FIXE assigne les bénéficiaires dans l’ordre des participants', async () => {
    const toursCrees: { numero: number; beneficiaireId?: string }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      cycleTontine: { create: async () => ({ id: 'c1' }) },
      participationTontine: { create: async () => ({}) },
      tourTontine: { create: async ({ data }: any) => { toursCrees.push(data); return data } },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tontine: { findFirst: async () => ({ id: 't1', modeRotation: 'ORDRE_FIXE' }) },
      cycleTontine: { aggregate: async () => ({ _max: { numero: null } }) },
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    }
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/tontines/t1/cycles',
      headers: auth(app, 'ADMIN'),
      payload: { participants: [{ membreId: 'm1' }, { membreId: 'm2' }, { membreId: 'm3' }] },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ cycleId: 'c1' })
    expect(toursCrees.map((t) => t.beneficiaireId)).toEqual(['m1', 'm2', 'm3'])
    await app.close()
  })

  it('ouvrir un cycle avec un participant en double → 400', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tontine: { findFirst: async () => ({ id: 't1', modeRotation: 'ORDRE_FIXE' }) },
      cycleTontine: { aggregate: async () => ({ _max: { numero: null } }) },
      $transaction: async (fn: (t: unknown) => unknown) => fn({}),
    }
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/tontines/t1/cycles',
      headers: auth(app, 'ADMIN'),
      payload: { participants: [{ membreId: 'm1' }, { membreId: 'm1' }] },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('ouvrir un cycle avec moins de 2 participants → 400 (schéma)', async () => {
    const app = await appAvec({})
    const res = await app.inject({
      method: 'POST',
      url: '/tontines/t1/cycles',
      headers: auth(app, 'ADMIN'),
      payload: { participants: [{ membreId: 'm1' }] },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('tirer un bénéficiaire hors mode TIRAGE → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tourTontine: {
        findFirst: async () => ({
          id: 'tour1',
          cycleId: 'c1',
          beneficiaireId: null,
          statut: 'A_VENIR',
          cycle: { tontine: { modeRotation: 'ORDRE_FIXE', montantBaseMise: 5000 } },
        }),
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/tours/tour1/tirer', headers: auth(app, 'ADMIN') })
    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('tirer en TIRAGE choisit un éligible non encore bénéficiaire', async () => {
    let beneficiaireEcrit: string | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tourTontine: {
        findFirst: async () => ({
          id: 'tour2',
          cycleId: 'c1',
          beneficiaireId: null,
          statut: 'A_VENIR',
          cycle: { tontine: { modeRotation: 'TIRAGE', montantBaseMise: 5000 } },
        }),
        findMany: async () => [{ beneficiaireId: 'm1' }], // m1 a déjà reçu
        update: async ({ data }: any) => { beneficiaireEcrit = data.beneficiaireId; return {} },
      },
      participationTontine: { findMany: async () => [{ membreId: 'm1' }, { membreId: 'm2' }] },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/tours/tour2/tirer', headers: auth(app, 'ADMIN') })
    expect(res.statusCode).toBe(200)
    expect(beneficiaireEcrit).toBe('m2') // seul éligible
    await app.close()
  })
})

describe('Tontine — flux d’argent (requireRoles)', () => {
  it('POST /tours/:id/mises par MEMBRE_SIMPLE → 403', async () => {
    const app = await appAvec({})
    const res = await app.inject({
      method: 'POST',
      url: '/tours/tour1/mises',
      headers: auth(app, 'MEMBRE_SIMPLE'),
      payload: { membreId: 'm1' },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('enregistrer une mise sans montant → parts × montantBaseMise', async () => {
    let montantEcrit: number | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tourTontine: {
        findFirst: async () => ({
          id: 'tour1',
          cycleId: 'c1',
          beneficiaireId: 'm2',
          statut: 'A_VENIR',
          cycle: { tontine: { modeRotation: 'ORDRE_FIXE', montantBaseMise: 5000 } },
        }),
      },
      participationTontine: { findMany: async () => [{ parts: 2 }] },
      miseTontine: { upsert: async ({ create }: any) => { montantEcrit = create.montant; return {} } },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/tours/tour1/mises',
      headers: auth(app, 'TRESORIERE'),
      payload: { membreId: 'm1' },
    })
    expect(res.statusCode).toBe(200)
    expect(montantEcrit).toBe(10_000) // 2 parts × 5000
    await app.close()
  })

  it('reverser un tour sans bénéficiaire → 409', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tourTontine: {
        findFirst: async () => ({
          id: 'tour1',
          cycleId: 'c1',
          beneficiaireId: null,
          statut: 'A_VENIR',
          cycle: { tontine: { modeRotation: 'TIRAGE', montantBaseMise: 5000 } },
        }),
      },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/tours/tour1/reverser', headers: auth(app, 'TRESORIERE') })
    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it('reverser fige le pot = Σ des mises + passe REVERSE', async () => {
    let dataRecu: { montantPot?: number; statut?: string; dateReversement?: unknown } | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      tourTontine: {
        findFirst: async () => ({
          id: 'tour1',
          cycleId: 'c1',
          beneficiaireId: 'm2',
          statut: 'A_VENIR',
          cycle: { tontine: { modeRotation: 'ORDRE_FIXE', montantBaseMise: 5000 } },
        }),
        update: async ({ data }: any) => { dataRecu = data; return {} },
      },
      miseTontine: { aggregate: async () => ({ _sum: { montant: 15_000 } }) },
    }
    const app = await appAvec(prisma)
    const res = await app.inject({ method: 'POST', url: '/tours/tour1/reverser', headers: auth(app, 'TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ montantPot: 15_000, beneficiaireId: 'm2' })
    expect(dataRecu?.montantPot).toBe(15_000)
    expect(dataRecu?.statut).toBe('REVERSE')
    expect(dataRecu?.dateReversement).toBeInstanceOf(Date)
    await app.close()
  })
})
