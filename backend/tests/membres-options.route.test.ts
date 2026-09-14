import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { PLAFOND_OPTIONS_MEMBRES } from '../src/services/membreStatut.service'

/**
 * Route GET /membres/options : liste LÉGÈRE des membres pour les sélecteurs et la palette ⌘K.
 * Le point vérifié est ce que la route NE charge PAS : ni contributions ni barèmes (aucun calcul
 * de statut de cotisation), là où `/membres/statuts` recalcule tout pour un simple nom à choisir.
 * Prisma mocké : on asserte les ARGUMENTS passés (`select`, `where`, `take`), qui sont le seul verrou.
 */

const membres = [
  { id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', statut: 'ACTIF', branche: { id: 'b1', nom: 'Nord' } },
  { id: 'm2', nom: 'Wamba', prenom: 'Alice', statut: 'INACTIF', branche: null },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appelsFindMany: any[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appelsCount: any[] = []
let appelsBaremes = 0
let totalSimule = membres.length

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: {
      findMany: async () => {
        appelsBaremes++
        return []
      },
    },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async (args: any = {}) => {
        appelsFindMany.push(args)
        return membres
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async (args: any = {}) => {
        appelsCount.push(args)
        return totalSimule
      },
    },
  }
  return prisma
}

describe('GET /membres/options', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    appelsFindMany = []
    appelsCount = []
    appelsBaremes = 0
    totalSimule = membres.length
  })

  const get = (role: string, sub = `u-${role}`) =>
    app.inject({
      method: 'GET',
      url: '/membres/options',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub, role })}` },
    })

  it('ADMIN : renvoie { items, total, tronque } avec les seuls champs d’identification', async () => {
    const res = await get('ADMIN')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      items: [
        { id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', statut: 'ACTIF', branche: { id: 'b1', nom: 'Nord' } },
        { id: 'm2', nom: 'Wamba', prenom: 'Alice', statut: 'INACTIF', branche: null },
      ],
      total: 2,
      tronque: false,
    })
  })

  it('ne charge NI contributions NI barèmes (aucun calcul de statut de cotisation)', async () => {
    await get('ADMIN')
    expect(appelsFindMany).toHaveLength(1)
    expect(appelsFindMany[0].select).toEqual({
      id: true,
      nom: true,
      prenom: true,
      statut: true,
      branche: { select: { id: true, nom: true } },
    })
    expect(appelsBaremes).toBe(0)
  })

  it('borne la lecture au plafond et trie par nom puis prénom', async () => {
    await get('ADMIN')
    expect(appelsFindMany[0].take).toBe(PLAFOND_OPTIONS_MEMBRES)
    expect(appelsFindMany[0].orderBy).toEqual([{ nom: 'asc' }, { prenom: 'asc' }])
    expect(appelsFindMany[0].where).toBeUndefined()
  })

  it('signale la troncature quand le total dépasse le plafond', async () => {
    totalSimule = PLAFOND_OPTIONS_MEMBRES + 1
    const body = (await get('ADMIN')).json()
    expect(body).toMatchObject({ total: PLAFOND_OPTIONS_MEMBRES + 1, tronque: true })
  })

  it('MEMBRE_SIMPLE : lecture ET décompte restreints à sa propre fiche', async () => {
    const res = await get('MEMBRE_SIMPLE', 'u-simple')
    expect(res.statusCode).toBe(200)
    expect(appelsFindMany[0].where).toEqual({ compteUtilisateurId: 'u-simple' })
    expect(appelsCount[0].where).toEqual({ compteUtilisateurId: 'u-simple' })
  })

  it('SUPER_ADMIN : hors matrice → 403, aucune lecture', async () => {
    const res = await get('SUPER_ADMIN')
    expect(res.statusCode).toBe(403)
    expect(appelsFindMany).toHaveLength(0)
  })
})
