import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * REFUS MÉTIER de la vue PERSO du dashboard — le membre rattaché au compte a disparu.
 *
 * Écrit AVANT la migration vers `ErreurMetier` (ADR-0001) : ce refus n'était retenu par aucun test.
 *
 * Le cas n'est pas théorique : la fiche membre est résolue par `compteUtilisateurId`, puis relue
 * par son id dans le service. Entre les deux, une suppression concurrente laisse un compte sans
 * fiche — et c'est la SEULE façon d'atteindre ce refus, les deux lectures visant la même ligne.
 * Il doit rendre un 404 propre, jamais un 500 : un compte administratif sans fiche est un cas
 * NORMAL du produit.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}

const membreSimple = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role: 'MEMBRE_SIMPLE', organisationId: 'org-1', langue: 'FR' })}`,
})

describe('GET /dashboard (vue perso) — refus métier', () => {
  it('fiche disparue entre la résolution du compte et sa relecture → 404, pas un 500', async () => {
    const app = await appAvec({
      membre: {
        // La ROUTE résout le compte → fiche trouvée. Le SERVICE relit par id → disparue.
        findUnique: async ({ where }: { where: Record<string, string> }) =>
          where['compteUtilisateurId'] ? { id: 'm1' } : null,
      },
    })
    const res = await app.inject({ method: 'GET', url: '/dashboard', headers: membreSimple(app) })
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBeTruthy()
    // Le message TECHNIQUE de l'erreur ne doit jamais sortir.
    expect(res.json().message).not.toMatch(/Error|undefined/)
    await app.close()
  })

  it('aucune fiche rattachée au compte → 404 AUSSI, mais par la garde de la route', async () => {
    // Deux chemins, un seul code : le compte purement administratif ne doit pas être distinguable
    // d'une fiche supprimée.
    const app = await appAvec({ membre: { findUnique: async () => null } })
    const res = await app.inject({ method: 'GET', url: '/dashboard', headers: membreSimple(app) })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
