import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { tirerBeneficiaire } from '../src/services/tontine.service'

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
      // Lecture SCOPÉE d'appartenance des participants (garde d'isolation) : ici tous sont de l'org.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      membre: { findMany: async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id })) },
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

/**
 * TIRAGE — le sélecteur d'index (CSPRNG `randomInt` en production, injecté ici pour être
 * déterministe). Le test de route ci-dessus n'a qu'UN éligible : il passe donc quelle que soit la
 * source d'aléa et n'exerce pas le sélecteur. Ces cas-ci le font au niveau SERVICE, seul endroit où
 * l'injection est possible (la route n'injecte rien — c'est justement ce qui garantit le CSPRNG).
 */
describe('Tontine — tirage : contrat du sélecteur d’index', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAvec = (participants: string[], dejaServis: string[], sortie: { ecrit: string | null }): any => ({
    tourTontine: {
      findFirst: async () => ({
        id: 'tourX',
        cycleId: 'c1',
        beneficiaireId: null,
        statut: 'A_VENIR',
        cycle: { tontine: { modeRotation: 'TIRAGE', montantBaseMise: 5000 } },
      }),
      findMany: async () => dejaServis.map((id) => ({ beneficiaireId: id })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ data }: any) => { sortie.ecrit = data.beneficiaireId; return {} },
    },
    participationTontine: { findMany: async () => participants.map((membreId) => ({ membreId })) },
  })

  it('borne le tirage sur les ÉLIGIBLES, pas sur tous les participants', async () => {
    const sortie = { ecrit: null as string | null }
    const bornesVues: number[] = []
    // 4 participants, 2 ont déjà reçu → 2 éligibles (m3, m4).
    await tirerBeneficiaire(
      prismaAvec(['m1', 'm2', 'm3', 'm4'], ['m1', 'm2'], sortie),
      'tourX',
      (n) => { bornesVues.push(n); return 0 },
    )
    // La borne DOIT être 2 : la passer à 4 tirerait un index hors de la liste filtrée (undefined
    // écrit en base) et biaiserait la distribution vers les premiers éligibles.
    expect(bornesVues).toEqual([2])
    expect(sortie.ecrit).toBe('m3')
  })

  it('l’index choisi désigne bien le n-ième éligible', async () => {
    const sortie = { ecrit: null as string | null }
    await tirerBeneficiaire(prismaAvec(['m1', 'm2', 'm3', 'm4'], ['m1'], sortie), 'tourX', () => 2)
    expect(sortie.ecrit).toBe('m4') // éligibles = [m2, m3, m4] → index 2
  })
})

/**
 * RÉGRESSION (isolation tenant) — `ouvrirCycle` recevait les `membreId` du CORPS de la requête et
 * créait les participations sans vérifier leur appartenance. L'extension tenant ne rattrape pas ce
 * cas : elle force `organisationId` sur le `create` mais laisse `membreId` tel quel, et la clé
 * étrangère vers `Membre` est satisfaite quelle que soit l'org. En ORDRE_FIXE, un membre étranger
 * serait devenu BÉNÉFICIAIRE d'un tour — donc destinataire du pot.
 */
describe('Tontine — appartenance des participants au cycle', () => {
  const prismaAvec = (membresVus: string[], creations: string[]) => ({
    tontine: { findFirst: async () => ({ id: 't1', modeRotation: 'ORDRE_FIXE' }) },
    cycleTontine: { aggregate: async () => ({ _max: { numero: 0 } }), create: async () => ({ id: 'c1' }) },
    // Lecture SCOPÉE simulée : ne renvoie QUE les membres de l'org courante.
    membre: {
      findFirst: async () => null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) =>
        (where.id.in as string[]).filter((id) => membresVus.includes(id)).map((id) => ({ id })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    participationTontine: { create: async ({ data }: any) => { creations.push(data.membreId); return {} } },
    tourTontine: { create: async () => ({}) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prismaCourant),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaCourant: any

  it('un membreId hors organisation → 404, AUCUNE participation créée', async () => {
    const creations: string[] = []
    prismaCourant = prismaAvec(['m1', 'm2'], creations) // m-etranger absent de l'org
    const app = await appAvec(prismaCourant)
    const res = await app.inject({
      method: 'POST',
      url: '/tontines/t1/cycles',
      headers: auth(app, 'ADMIN'),
      payload: { participants: [{ membreId: 'm1' }, { membreId: 'm-etranger' }] },
    })
    expect(res.statusCode).toBe(404)
    expect(creations, 'aucune écriture avant l’échec de la garde').toEqual([])
    await app.close()
  })

  it('tous les membres de l’org → cycle créé normalement', async () => {
    const creations: string[] = []
    prismaCourant = prismaAvec(['m1', 'm2'], creations)
    const app = await appAvec(prismaCourant)
    const res = await app.inject({
      method: 'POST',
      url: '/tontines/t1/cycles',
      headers: auth(app, 'ADMIN'),
      payload: { participants: [{ membreId: 'm1' }, { membreId: 'm2' }] },
    })
    expect(res.statusCode).toBe(201)
    expect(creations).toEqual(['m1', 'm2'])
    await app.close()
  })
})
