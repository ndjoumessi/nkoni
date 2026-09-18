/**
 * Tests de charge (roadmap 2.4) — `npm run charge` (base JETABLE obligatoire, cf. `exigerBaseJetable`).
 *
 *   DATABASE_URL=postgresql://…/nkoni_it_demo npm run charge -- [--tailles 100,1000,3000]
 *                                                              [--duree 10] [--connexions 10]
 *
 * Trois phases, résultats consignés dans `docs/performance-charge.md` :
 *
 * 1. **N+1** — chaque route mesurée est appelée UNE fois, à la suite, et on compte les opérations
 *    Prisma qu'elle déclenche (extension de comptage posée PAR-DESSUS l'isolation tenant). Le compte
 *    doit être le même quelle que soit la taille de l'organisation : un compte qui grandit avec elle
 *    trahit une requête par ligne.
 * 2. **Latence et débit** — serveur HTTP réel, `autocannon`, N connexions pendant D secondes par
 *    route, rate-limit NEUTRALISÉ (on mesure le serveur, pas le budget).
 * 3. **Budgets de rate-limit** — rate-limit ACTIF, une seule IP (127.0.0.1), plusieurs comptes :
 *    chaque compte doit disposer de son propre budget, ce qui était faux avant (cf. `lib/rate-limit.ts`).
 */
import 'dotenv/config'
import autocannon from 'autocannon'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import type { PrismaClient } from '../src/lib/prisma'
import { routesMesurees as routes } from './routes-mesurees'
import {
  exigerBaseJetable,
  genererOrganisationDeCharge,
  nettoyerOrganisationsDeCharge,
  type OrganisationDeCharge,
} from './jeu-de-charge'

function option(nom: string, defaut: string): string {
  const i = process.argv.indexOf(`--${nom}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : defaut
}

const TAILLES = option('tailles', '100,1000,3000').split(',').map(Number)
const DUREE = Number(option('duree', '10'))
const CONNEXIONS = Number(option('connexions', '10'))

/** Client Prisma qui COMPTE ses opérations, posé par-dessus le client réel (isolation incluse). */
let operations = 0
const prismaCompteur = (prisma as unknown as { $extends: (e: object) => unknown }).$extends({
  query: {
    async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
      operations++
      return query(args)
    },
  },
}) as PrismaClient

async function construire(avecRateLimit: boolean): Promise<FastifyInstance> {
  // `buildApp` n'enregistre le rate-limit que hors test : on bascule NODE_ENV le temps de construire.
  const precedent = process.env['NODE_ENV']
  process.env['NODE_ENV'] = avecRateLimit ? 'production-charge' : 'test'
  const { buildApp } = await import('../src/app')
  const app = await buildApp({ prisma: prismaCompteur, logger: false, demoActivee: false })
  process.env['NODE_ENV'] = precedent
  await app.ready()
  return app
}

async function jeton(app: FastifyInstance, email: string, motDePasse: string): Promise<string> {
  const rep = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: motDePasse, rememberMe: false } })
  if (rep.statusCode !== 200) throw new Error(`connexion ${email} : ${rep.statusCode} ${rep.body}`)
  return (rep.json() as { accessToken: string }).accessToken
}

const ms = (v: number) => `${Math.round(v)} ms`

async function main(): Promise<void> {
  const base = exigerBaseJetable(process.env['DATABASE_URL'])
  console.log(`# Tests de charge — base « ${base} », tailles ${TAILLES.join(', ')}, ${CONNEXIONS} connexions × ${DUREE} s\n`)

  const supprimees = await nettoyerOrganisationsDeCharge(prisma)
  if (supprimees) console.log(`(${supprimees} organisation(s) de charge précédente(s) supprimée(s))\n`)

  const orgs: OrganisationDeCharge[] = []
  for (const taille of TAILLES) {
    const debut = Date.now()
    const org = await genererOrganisationDeCharge(prisma, taille)
    orgs.push(org)
    console.log(
      `Jeu ${taille} membres : ${org.lignes.contributions} contributions, ${org.lignes.versements} versements (${ms(Date.now() - debut)})`,
    )
  }

  // ─── Phase 1 : N+1 ────────────────────────────────────────────────────────────────────────────
  const app = await construire(false)
  const tokens = new Map<string, { admin: string; simple: string }>()
  for (const org of orgs) {
    tokens.set(org.organisationId, {
      admin: await jeton(app, org.admin.email, org.admin.motDePasse),
      simple: await jeton(app, org.membreSimple.email, org.membreSimple.motDePasse),
    })
  }

  console.log('\n## Phase 1 — opérations Prisma par requête (N+1)\n')
  console.log(`| Route | ${TAILLES.map((t) => `${t} membres`).join(' | ')} | Verdict |`)
  console.log(`|---|${TAILLES.map(() => '---:').join('|')}|---|`)
  const listeRoutes = routes(orgs[0]!.membreSimple.membreId)
  const suspects: string[] = []
  for (const [i, r] of listeRoutes.entries()) {
    const comptes: string[] = []
    const valeurs: number[] = []
    for (const org of orgs) {
      const route = routes(org.membreSimple.membreId)[i]!
      const t = tokens.get(org.organisationId)!
      operations = 0
      const rep = await app.inject({ method: 'GET', url: route.url, headers: { authorization: `Bearer ${route.simple ? t.simple : t.admin}` } })
      if (rep.statusCode !== 200) throw new Error(`${route.url} → ${rep.statusCode} ${rep.body.slice(0, 200)}`)
      valeurs.push(operations)
      comptes.push(String(operations))
    }
    const constant = valeurs.every((v) => v === valeurs[0])
    if (!constant) suspects.push(r.nom)
    console.log(`| ${r.nom} | ${comptes.join(' | ')} | ${constant ? 'constant' : '**CROÎT AVEC LA TAILLE**'} |`)
  }

  // ─── Phase 2 : latence et débit ───────────────────────────────────────────────────────────────
  const adresse = await app.listen({ port: 0, host: '127.0.0.1' })
  console.log(`\n## Phase 2 — latence et débit (${CONNEXIONS} connexions, ${DUREE} s par route, rate-limit neutralisé)\n`)
  console.log('| Route | Taille | Req/s | p50 | p97.5 | p99 | Max | Erreurs |')
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const org of orgs) {
    const t = tokens.get(org.organisationId)!
    for (const r of routes(org.membreSimple.membreId)) {
      const res = await autocannon({
        url: `${adresse}${r.url}`,
        connections: CONNEXIONS,
        duration: DUREE,
        headers: { authorization: `Bearer ${r.simple ? t.simple : t.admin}` },
      })
      const erreurs = res.errors + res.timeouts + res.non2xx
      console.log(
        `| ${r.nom} | ${org.taille} | ${Math.round(res.requests.average)} | ${ms(res.latency.p50)} | ${ms(res.latency.p97_5)} | ${ms(res.latency.p99)} | ${ms(res.latency.max)} | ${erreurs} |`,
      )
    }
  }
  await app.close()

  // ─── Phase 3 : budgets de rate-limit ──────────────────────────────────────────────────────────
  const limite = await construire(true)
  const org = orgs[0]!
  const t = tokens.get(org.organisationId)!
  const rafale = async (entete: string | undefined, n: number): Promise<number> => {
    let refus = 0
    for (let k = 0; k < n; k++) {
      const rep = await limite.inject({ method: 'GET', url: '/tresorerie', headers: entete ? { authorization: entete } : {} })
      if (rep.statusCode === 429) refus++
    }
    return refus
  }
  console.log('\n## Phase 3 — budgets de rate-limit (une seule IP, rate-limit actif, 300/min)\n')
  const refusAdmin = await rafale(`Bearer ${t.admin}`, 300)
  const refusSimple = await rafale(`Bearer ${t.simple}`, 300)
  const refusAnonyme = await rafale(undefined, 301)
  const refusAdminApres = await rafale(`Bearer ${t.admin}`, 1)
  console.log(`- Compte A (bureau), 300 requêtes : ${refusAdmin} refus`)
  console.log(`- Compte B (membre), 300 requêtes depuis la MÊME IP : ${refusSimple} refus — budget distinct du compte A`)
  console.log(`- Anonyme, 301 requêtes depuis cette IP : ${refusAnonyme} refus (seau IP, indépendant des comptes)`)
  console.log(`- Compte A, 301ᵉ requête : ${refusAdminApres ? 'refusée (429) — son propre budget est épuisé' : 'ACCEPTÉE — anomalie'}`)
  await limite.close()

  await nettoyerOrganisationsDeCharge(prisma)
  console.log(`\nJeux de charge supprimés. ${suspects.length ? `Routes suspectes (N+1) : ${suspects.join(', ')}` : 'Aucune route N+1.'}`)
  if (suspects.length || refusSimple || !refusAdminApres) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
