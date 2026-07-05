import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { tenantExtension, TenantContextError } from '../src/lib/tenant-extension'
import { orgContext } from '../src/lib/org-context'

/**
 * Test d'ISOLATION multi-tenant (SaaS §2.2) — contre une VRAIE base (DATABASE_URL local),
 * via le client étendu par l'extension d'isolation. Prouve concrètement (pas par
 * affirmation) : scoping des listes, absence de fuite par accès direct (id), injection de
 * l'organisation au create, fail-closed sans contexte, bypass runUnscoped, garde des
 * mutations cross-org, et l'isolation des relations M2M (Conflit ↔ Membre).
 */

const ORG_A = 'a0000000-0000-4000-8000-000000000001'
const ORG_B = 'b0000000-0000-4000-8000-000000000002'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })
const client = base.$extends(tenantExtension(base)) as unknown as PrismaClient

let membreAId = ''
let membreBId = ''
let auteurAId = ''

/** Nettoyage idempotent (via `base`, non scopé). Ordre FK : conflits → membres/users → orgs. */
async function nettoyer(): Promise<void> {
  await base.conflit.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.membre.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.utilisateur.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.organisation.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG_A, nom: 'Org A', devise: 'FCFA' } })
  await base.organisation.create({ data: { id: ORG_B, nom: 'Org B', devise: 'FCFA' } })
  const uA = await base.utilisateur.create({
    data: { organisationId: ORG_A, email: `auteur-a-${ORG_A}@test.local`, passwordHash: 'x', role: 'ADMIN' },
  })
  auteurAId = uA.id
  const mA = await base.membre.create({
    data: { organisationId: ORG_A, nom: 'Alpha', prenom: 'A', anneeAdhesion: 2020 },
  })
  const mB = await base.membre.create({
    data: { organisationId: ORG_B, nom: 'Bravo', prenom: 'B', anneeAdhesion: 2020 },
  })
  membreAId = mA.id
  membreBId = mB.id
})

afterAll(async () => {
  await nettoyer()
  await base.$disconnect()
})

// Exécute `fn` DANS le contexte d'une org, en awaitant à l'intérieur du `run` pour que le
// contexte AsyncLocalStorage couvre bien l'exécution (différée) de la requête Prisma.
// (En prod, le contexte est établi par un hook onRequest via enterWith → non concerné.)
function enOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  return orgContext.run({ organisationId: orgId }, async () => await fn())
}

describe('Isolation multi-tenant (§2.2) — extension Prisma', () => {
  it('findMany : ne renvoie QUE les données de l’org courante', async () => {
    const list = await enOrg(ORG_A, () => client.membre.findMany())
    const ids = list.map((m) => m.id)
    expect(ids).toContain(membreAId)
    expect(ids).not.toContain(membreBId)
  })

  it('findUnique par id : pas de fuite cross-org (null pour une cible d’une autre org)', async () => {
    const leak = await enOrg(ORG_A, () => client.membre.findUnique({ where: { id: membreBId } }))
    expect(leak).toBeNull()
    const own = await enOrg(ORG_A, () => client.membre.findUnique({ where: { id: membreAId } }))
    expect(own?.id).toBe(membreAId)
  })

  it('create : injecte automatiquement organisationId', async () => {
    const cree = await enOrg(ORG_A, () =>
      client.membre.create({ data: { nom: 'Charlie', prenom: 'C', anneeAdhesion: 2021 } }),
    )
    expect(cree.organisationId).toBe(ORG_A)
    await base.membre.delete({ where: { id: cree.id } })
  })

  it('create : un organisationId fourni par l’appelant est IGNORÉ (forcé à l’org courante)', async () => {
    // Tentative de contournement : créer en contexte A un membre marqué org B.
    const cree = await enOrg(ORG_A, () =>
      client.membre.create({
        // @ts-expect-error organisationId n'est pas censé être passé — on teste le durcissement
        data: { nom: 'Pirate', prenom: 'P', anneeAdhesion: 2021, organisationId: ORG_B },
      }),
    )
    expect(cree.organisationId).toBe(ORG_A) // forcé, pas ORG_B
    await base.membre.delete({ where: { id: cree.id } })
  })

  it('update : impossible de DÉPLACER un enregistrement vers une autre org', async () => {
    const maj = await enOrg(ORG_A, () =>
      client.membre.update({
        where: { id: membreAId },
        // @ts-expect-error tentative de réassignation d'org — doit être neutralisée
        data: { organisationId: ORG_B, telephone: '111' },
      }),
    )
    expect(maj.organisationId).toBe(ORG_A) // resté dans A malgré la tentative
    expect(maj.telephone).toBe('111')
  })

  it('fail-closed : requête scopée sans contexte org → TenantContextError', async () => {
    await expect(client.membre.findMany()).rejects.toBeInstanceOf(TenantContextError)
    await expect(
      orgContext.run({}, async () => await client.membre.findMany()),
    ).rejects.toBeInstanceOf(TenantContextError)
  })

  it('runUnscoped : bypass délibéré (voit les deux orgs)', async () => {
    const all = await orgContext.runUnscoped(async () =>
      client.membre.findMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } }),
    )
    expect(all.map((m) => m.id)).toEqual(expect.arrayContaining([membreAId, membreBId]))
  })

  it('update/delete cross-org : refusé (garde par pré-lecture) ; la sienne passe', async () => {
    await expect(
      enOrg(ORG_A, () =>
        client.membre.update({ where: { id: membreBId }, data: { telephone: 'pirate' } }),
      ),
    ).rejects.toBeInstanceOf(TenantContextError)

    const maj = await enOrg(ORG_A, () =>
      client.membre.update({ where: { id: membreAId }, data: { telephone: '698000000' } }),
    )
    expect(maj.telephone).toBe('698000000')

    // Le membre de l'org B est resté intact.
    const bIntact = await base.membre.findUnique({ where: { id: membreBId } })
    expect(bIntact?.telephone).toBeNull()
  })

  it('M2M Conflit↔Membre : un membre d’une autre org est invisible → non liable, et la lecture ne fuit pas', async () => {
    // (a) En org A, membreB est invisible → impossible de l'obtenir pour le lier.
    const visibleB = await enOrg(ORG_A, () => client.membre.findMany({ where: { id: membreBId } }))
    expect(visibleB).toHaveLength(0)

    // (b) La validation des ids concernés (findMany scopé) filtre membreB.
    const validables = await enOrg(ORG_A, () =>
      client.membre.findMany({ where: { id: { in: [membreAId, membreBId] } } }),
    )
    expect(validables.map((m) => m.id)).toEqual([membreAId])

    // (c) Même si un lien cross-org était forcé HORS application (base brute), la lecture
    // scopée des membres de l'org A ne fait jamais apparaître membreB.
    const conflit = await base.conflit.create({
      data: {
        organisationId: ORG_A,
        titre: 't',
        description: 'd',
        niveauConfidentialite: 'PUBLIC',
        auteurId: auteurAId,
        membresConcernes: { connect: [{ id: membreBId }] },
      },
    })
    const membresOrgA = await enOrg(ORG_A, () => client.membre.findMany())
    expect(membresOrgA.map((m) => m.id)).not.toContain(membreBId)
    await base.conflit.delete({ where: { id: conflit.id } })
  })
})
