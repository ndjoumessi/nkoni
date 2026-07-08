import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Export (§5.9) : permissions (matrice §2, ligne « Export »), format PDF/Excel,
 * en-têtes HTTP et bytes magiques du fichier. Prisma mocké.
 */

const contributions = [
  {
    membreId: 'm1', annee: 2025, montantAttendu: 10_000, montantVerse: 10_000,
    montantValorise: 10_000, membre: { nom: 'Tchoupa', prenom: 'Bernard' },
  },
  {
    membreId: 'm2', annee: 2025, montantAttendu: 10_000, montantVerse: 4_000,
    montantValorise: 4_000, membre: { nom: 'Wamba', prenom: 'Alice' },
  },
]

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    contribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        let res = contributions
        if (where?.annee !== undefined) res = res.filter((c) => c.annee === where.annee)
        if (where?.membreId !== undefined) res = res.filter((c) => c.membreId === where.membreId)
        return res
      },
    },
    // Devise de l'org de l'exporteur (résolue pour formater les montants du PDF).
    utilisateur: { findUnique: async () => ({ organisation: { devise: 'FCFA' } }) },
  }
  return prisma
}

describe('Routes Export (§5.9)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role })}` })
  const get = (role: string, qs = '') =>
    app.inject({ method: 'GET', url: `/exports/contributions${qs}`, headers: auth(role) })

  /* --- Format / contenu ------------------------------------------------- */

  it('ADMIN : export Excel par défaut (200, content-type xlsx, signature PK)', async () => {
    const res = await get('ADMIN')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet')
    expect(res.headers['content-disposition']).toContain('contributions.xlsx')
    expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('TRESORIERE : export PDF (200, content-type pdf, signature %PDF)', async () => {
    const res = await get('TRESORIERE', '?format=pdf')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('contributions.pdf')
    expect(res.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('filtre annee : nom de fichier suffixé et requête filtrée (200)', async () => {
    const res = await get('COMMISSAIRE_COMPTES', '?format=xlsx&annee=2025')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('contributions-2025.xlsx')
  })

  /* --- Permissions ------------------------------------------------------ */

  it('PRESIDENT : autorisé (200)', async () => {
    expect((await get('PRESIDENT')).statusCode).toBe(200)
  })

  it('COMMISSAIRE_COMPTES : autorisé (200)', async () => {
    expect((await get('COMMISSAIRE_COMPTES')).statusCode).toBe(200)
  })

  it('SECRETAIRE : export refusé (403)', async () => {
    expect((await get('SECRETAIRE')).statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE : export refusé (403)', async () => {
    expect((await get('MEMBRE_SIMPLE')).statusCode).toBe(403)
  })

  it('GUIDE_RELIGIEUX : export refusé (403)', async () => {
    expect((await get('GUIDE_RELIGIEUX')).statusCode).toBe(403)
  })
})
