import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma, type PrismaClient } from '../src/lib/prisma'
import {
  genererOrganisationDeCharge,
  supprimerOrganisationDeCharge,
  type OrganisationDeCharge,
} from '../perf/jeu-de-charge'
import { routesMesurees } from '../perf/routes-mesurees'

/**
 * GARDE N+1 (roadmap 2.4) — le nombre d'opérations Prisma d'une route lourde NE DÉPEND PAS de la
 * taille de l'organisation. Deux organisations fictives (10 et 80 membres, jeux déterministes) ; chaque
 * route de `perf/routes-mesurees.ts` est appelée une fois dans chacune, et les comptes doivent être
 * IDENTIQUES. Une requête par membre (ou par contribution) glissée dans une boucle fait diverger les
 * deux comptes — les tests sur mocks ne le verraient pas, un mock ne coûte rien par appel.
 *
 * Le compteur est une extension posée PAR-DESSUS le client réel : l'isolation tenant s'applique
 * toujours, on compte ce que la route demande, pas ce qu'on aurait voulu qu'elle demande.
 * Même mesure, à plus grande échelle et avec la latence, dans `npm run charge`.
 */
let operations = 0
const prismaCompteur = (prisma as unknown as { $extends: (e: object) => unknown }).$extends({
  query: {
    async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
      operations++
      return query(args)
    },
  },
}) as PrismaClient

let app: FastifyInstance
const orgs: OrganisationDeCharge[] = []
const jetons = new Map<string, { admin: string; simple: string }>()

async function connecter(email: string, password: string): Promise<string> {
  const rep = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password, rememberMe: false } })
  expect(rep.statusCode).toBe(200)
  return (rep.json() as { accessToken: string }).accessToken
}

beforeAll(async () => {
  app = await buildApp({ prisma: prismaCompteur, logger: false, demoActivee: false })
  await app.ready()
  for (const taille of [10, 80]) {
    const org = await genererOrganisationDeCharge(prisma, taille)
    orgs.push(org)
    jetons.set(org.organisationId, {
      admin: await connecter(org.admin.email, org.admin.motDePasse),
      simple: await connecter(org.membreSimple.email, org.membreSimple.motDePasse),
    })
  }
}, 60_000)

afterAll(async () => {
  for (const org of orgs) await supprimerOrganisationDeCharge(prisma, org.organisationId)
  await app?.close()
}, 60_000)

describe('garde N+1 — opérations Prisma indépendantes de la taille de l’organisation', () => {
  it('chaque route lourde fait autant d’opérations à 10 qu’à 80 membres', async () => {
    const divergences: string[] = []
    const nbRoutes = routesMesurees('x').length
    expect(nbRoutes).toBeGreaterThan(0) // jamais vacant

    for (let i = 0; i < nbRoutes; i++) {
      const comptes: number[] = []
      for (const org of orgs) {
        const route = routesMesurees(org.membreSimple.membreId)[i]!
        const jeton = jetons.get(org.organisationId)!
        operations = 0
        const rep = await app.inject({
          method: 'GET',
          url: route.url,
          headers: { authorization: `Bearer ${route.simple ? jeton.simple : jeton.admin}` },
        })
        expect(rep.statusCode, `${route.url} → ${rep.body.slice(0, 200)}`).toBe(200)
        comptes.push(operations)
      }
      // Une route qui ne déclencherait AUCUNE opération rendrait la comparaison vacante.
      expect(comptes[0], routesMesurees('x')[i]!.nom).toBeGreaterThan(0)
      if (comptes[0] !== comptes[1]) divergences.push(`${routesMesurees('x')[i]!.nom} : ${comptes.join(' → ')}`)
    }
    expect(divergences).toEqual([])
  }, 60_000)
})
