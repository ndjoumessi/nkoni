import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Route GET /membres/statuts : liste enrichie du statut de cotisation (bulk).
 * Vérifie les permissions de lecture (§2) et la restriction MEMBRE_SIMPLE. Prisma mocké.
 */

const baremes = [{ annee: 2024, montantAttendu: 10_000 }]
const membres = [
  {
    id: 'm1', nom: 'Tchoupa', prenom: 'Bernard', sexe: 'M', statut: 'ACTIF', telephone: null,
    brancheId: 'b1', branche: { id: 'b1', nom: 'Nord' },
    anneeAdhesion: 2024, anneeFinContribution: null, compteUtilisateurId: 'u-simple',
    contributions: [{ annee: 2024, montantValorise: 10_000 }],
  },
  {
    id: 'm2', nom: 'Wamba', prenom: 'Alice', sexe: 'F', statut: 'ACTIF', telephone: null,
    brancheId: null, branche: null,
    anneeAdhesion: 2024, anneeFinContribution: null, compteUtilisateurId: null,
    contributions: [],
  },
]

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any = {}) => {
        if (where?.compteUtilisateurId) {
          return membres.filter((m) => m.compteUtilisateurId === where.compteUtilisateurId)
        }
        return membres
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async ({ where }: any = {}) =>
        where?.compteUtilisateurId
          ? membres.filter((m) => m.compteUtilisateurId === where.compteUtilisateurId).length
          : membres.length,
    },
  }
  return prisma
}

describe('GET /membres/statuts', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })
  const get = (role: string, sub?: string) =>
    app.inject({ method: 'GET', url: '/membres/statuts', headers: sub ? auth(role, sub) : auth(role) })

  it('ADMIN : liste complète enrichie du statutCotisation (200)', async () => {
    const res = await get('ADMIN')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ total: 2, tronque: false })
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({ id: 'm1', statutCotisation: 'A_JOUR', branche: { nom: 'Nord' } })
    expect(body.items[1]).toMatchObject({ id: 'm2', statutCotisation: 'NON_A_JOUR', branche: null })
  })

  it('COMMISSAIRE_COMPTES : autorisé en lecture (200)', async () => {
    expect((await get('COMMISSAIRE_COMPTES')).statusCode).toBe(200)
  })

  it('MEMBRE_SIMPLE : restreint à sa propre fiche', async () => {
    const res = await get('MEMBRE_SIMPLE', 'u-simple')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('m1')
  })
})
