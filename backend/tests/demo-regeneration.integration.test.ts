import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { chargerCompteDemo } from '../src/services/demo.service'
import { genererOrganisationDemo } from '../src/services/demo-generateur.service'
import { supprimerOrganisationDemo } from '../src/services/demo-suppression.service'
import { regenererDemo } from '../src/services/demo-regeneration.service'
import { envelopperPrisma } from './support/prisma-espion'

/**
 * Spec 2026-09-15 §3.2, contre une VRAIE Postgres. La base est partagée par des fichiers exécutés en
 * parallèle (dont d'autres organisations démo) : le client est enveloppé pour que la régénération ne
 * VOIE que les organisations de CE fichier — sans quoi elle supprimerait les fixtures des autres.
 * Couvre aussi l'ordre de `chargerCompteDemo` (« démo active la plus récente »), mocké en PR 1.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const ANCIENNE = 'eb000000-0000-4000-8000-0000000000b1'
const ORPHELINE = 'eb000000-0000-4000-8000-0000000000b2'
const EN_COURS = 'eb000000-0000-4000-8000-0000000000b3'
const REELLE = 'eb000000-0000-4000-8000-0000000000b4'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blob = { del: async () => undefined }
const connus = new Set<string>([ANCIENNE, ORPHELINE, EN_COURS, REELLE])
let generations = 0

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-regeneration.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const restreindre = (rows: any[]) => rows.filter((r) => connus.has(r.id))
const client = envelopperPrisma(prismaEtendu, {
  organisation: {
    findMany: async (originale, args) => restreindre(await originale({ ...args, select: { ...(args?.select ?? {}), id: true } })),
    findFirst: async (_originale, args) => {
      const lignes = restreindre(await prismaEtendu.organisation.findMany({ where: args.where, orderBy: args.orderBy, select: { ...(args.select ?? {}), id: true } }))
      return lignes[0] ?? null
    },
  },
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generer = async (p: any, b: any, now: Date) => {
  generations++
  const r = await genererOrganisationDemo(p, b, now)
  connus.add(r.organisationId)
  return r
}

const ilYA = (ms: number) => new Date(Date.now() - ms)

async function nettoyerTout(): Promise<void> {
  for (const id of connus) {
    const org = await base.organisation.findUnique({ where: { id }, select: { estDemo: true } })
    if (org?.estDemo) await supprimerOrganisationDemo(prismaEtendu, blob, id)
  }
  await base.utilisateur.deleteMany({ where: { organisationId: REELLE } })
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: { in: [...connus] } } })
  await base.organisation.deleteMany({ where: { id: REELLE } })
}

beforeAll(async () => {
  exigerBaseDeTest()
  await nettoyerTout()
  await base.organisation.create({ data: { id: ANCIENNE, nom: 'Démo ancienne', devise: 'FCFA', estDemo: true, actif: true, createdAt: ilYA(10 * 86_400_000) } })
  await base.utilisateur.create({ data: { organisationId: ANCIENNE, email: 'admin-ancienne@demo-regeneration-it.local', passwordHash: 'x', role: 'ADMIN', actif: true } })
  await base.organisation.create({ data: { id: ORPHELINE, nom: 'Démo orpheline', devise: 'FCFA', estDemo: true, actif: false, createdAt: ilYA(2 * 3_600_000) } })
  await base.organisation.create({ data: { id: EN_COURS, nom: 'Démo en cours de génération', devise: 'FCFA', estDemo: true, actif: false, createdAt: ilYA(10 * 60_000) } })
  await base.organisation.create({ data: { id: REELLE, nom: 'Organisation réelle', devise: 'FCFA' } })
  await base.utilisateur.create({ data: { organisationId: REELLE, email: 'admin-reelle@demo-regeneration-it.local', passwordHash: 'x', role: 'ADMIN', actif: true } })
})

afterAll(async () => {
  await nettoyerTout()
  await base.$disconnect()
}, 180_000)

describe('regenererDemo', () => {
  let nouvelle = ''

  it('démo trop ancienne : génère la nouvelle PUIS supprime l’ancienne et l’orpheline, garde la génération en cours et le réel', async () => {
    const r = await regenererDemo(client, blob, { generer })
    expect(r.statut).toBe('REGENEREE')
    nouvelle = r.demoId
    expect(await base.organisation.findUnique({ where: { id: nouvelle }, select: { estDemo: true, actif: true } })).toEqual({ estDemo: true, actif: true })
    expect(await base.organisation.findUnique({ where: { id: ANCIENNE } })).toBeNull()
    expect(await base.organisation.findUnique({ where: { id: ORPHELINE } })).toBeNull()
    expect(await base.organisation.findUnique({ where: { id: EN_COURS } })).not.toBeNull()
    expect(await base.organisation.findUnique({ where: { id: REELLE } })).not.toBeNull()
    expect(r.supprimees.sort()).toEqual([ANCIENNE, ORPHELINE].sort())
  }, 300_000)

  it('chargerCompteDemo ouvre la démo active la plus récente (celle qui vient d’être générée)', async () => {
    const compte = await orgContext.runUnscoped(async () => await chargerCompteDemo(client))
    expect(compte?.organisationId).toBe(nouvelle)
  })

  it('démo récente : rien n’est généré', async () => {
    const avant = generations
    const r = await regenererDemo(client, blob, { generer })
    expect(r).toMatchObject({ statut: 'A_JOUR', demoId: nouvelle })
    expect(generations).toBe(avant)
  })

  it('forcer : régénère malgré une démo récente, une seule démo active reste', async () => {
    const r = await regenererDemo(client, blob, { generer, forcer: true })
    expect(r.statut).toBe('REGENEREE')
    expect(r.supprimees).toContain(nouvelle)
    const demosActives = await base.organisation.findMany({ where: { id: { in: [...connus] }, estDemo: true, actif: true }, select: { id: true } })
    expect(demosActives.map((o) => o.id)).toEqual([r.demoId])
  }, 300_000)
})
