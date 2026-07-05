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

/** Nettoyage idempotent (via `base`, non scopé). Ordre FK : enfants → parents → orgs. */
async function nettoyer(): Promise<void> {
  const orgs = { organisationId: { in: [ORG_A, ORG_B] } }
  await base.conflitMembreConcerne.deleteMany({ where: orgs })
  await base.conflit.deleteMany({ where: orgs })
  await base.pointOrdreDuJour.deleteMany({ where: orgs })
  await base.reunion.deleteMany({ where: orgs })
  await base.baremeAnnuel.deleteMany({ where: orgs })
  await base.membre.deleteMany({ where: orgs })
  await base.utilisateur.deleteMany({ where: orgs })
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

  it('update/delete cross-org : traité comme introuvable (P2025) ; la sienne passe', async () => {
    // Cross-org = indistinguable d'un id inexistant → P2025 (pas TenantContextError, réservé
    // à l'absence de contexte) → les routes le mappent en 404 sans fuite d'existence.
    await expect(
      enOrg(ORG_A, () =>
        client.membre.update({ where: { id: membreBId }, data: { telephone: 'pirate' } }),
      ),
    ).rejects.toMatchObject({ code: 'P2025' })

    const maj = await enOrg(ORG_A, () =>
      client.membre.update({ where: { id: membreAId }, data: { telephone: '698000000' } }),
    )
    expect(maj.telephone).toBe('698000000')

    // Le membre de l'org B est resté intact.
    const bIntact = await base.membre.findUnique({ where: { id: membreBId } })
    expect(bIntact?.telephone).toBeNull()
  })

  it('M2M Conflit↔Membre (join explicite) : membre d’une autre org invisible → non liable ; le join est scopé', async () => {
    // (a) En org A, membreB est invisible → impossible de l'obtenir pour le lier.
    const visibleB = await enOrg(ORG_A, () => client.membre.findMany({ where: { id: membreBId } }))
    expect(visibleB).toHaveLength(0)

    // (b) La validation des ids concernés (findMany scopé) filtre membreB.
    const validables = await enOrg(ORG_A, () =>
      client.membre.findMany({ where: { id: { in: [membreAId, membreBId] } } }),
    )
    expect(validables.map((m) => m.id)).toEqual([membreAId])

    // (c) La table de jointure est elle-même un modèle SCOPÉ : un lien stampé ORG_B (planté
    // HORS application via `base` brut) n'apparaît jamais dans une lecture scopée ORG_A,
    // mais est bien visible côté ORG_B. Le join rentre dans le mécanisme commun d'isolation.
    const conflit = await base.conflit.create({
      data: { organisationId: ORG_A, titre: 't', description: 'd', niveauConfidentialite: 'PUBLIC', auteurId: auteurAId },
    })
    await base.conflitMembreConcerne.create({
      data: { conflitId: conflit.id, membreId: membreBId, organisationId: ORG_B },
    })
    const liensVusEnA = await enOrg(ORG_A, () => client.conflitMembreConcerne.findMany())
    expect(liensVusEnA.some((l) => l.membreId === membreBId)).toBe(false)
    const liensVusEnB = await enOrg(ORG_B, () => client.conflitMembreConcerne.findMany())
    expect(liensVusEnB.some((l) => l.membreId === membreBId)).toBe(true)

    // (d) Et une lecture imbriquée scopée des membres de l'org A ne fait pas apparaître membreB.
    const membresOrgA = await enOrg(ORG_A, () => client.membre.findMany())
    expect(membresOrgA.map((m) => m.id)).not.toContain(membreBId)
    await base.conflit.delete({ where: { id: conflit.id } })
  })

  it('unique PAR ORG (C3) : même annee de barème dans 2 orgs OK ; doublon dans la même org rejeté', async () => {
    // Même année dans A et dans B → autorisé (espaces de noms disjoints par organisation).
    const a = await enOrg(ORG_A, () => client.baremeAnnuel.create({ data: { annee: 2099, montantAttendu: 1 } }))
    const b = await enOrg(ORG_B, () => client.baremeAnnuel.create({ data: { annee: 2099, montantAttendu: 2 } }))
    expect(a.organisationId).toBe(ORG_A)
    expect(b.organisationId).toBe(ORG_B)

    // Doublon (2099) dans la MÊME org → violation de @@unique([organisationId, annee]).
    await expect(
      enOrg(ORG_A, () => client.baremeAnnuel.create({ data: { annee: 2099, montantAttendu: 3 } })),
    ).rejects.toMatchObject({ code: 'P2002' })

    await base.baremeAnnuel.deleteMany({ where: { annee: 2099, organisationId: { in: [ORG_A, ORG_B] } } })
  })

  it('enfant scopé en op top-level (Phase B) : un point créé via createMany porte organisationId', async () => {
    // Valide le refactor reunion/equilibrage : les enfants scopés (PointOrdreDuJour,
    // EquilibrageDetail) sont créés en op TOP-LEVEL → l'extension injecte organisationId.
    // Sous NOT NULL, un nested create (non ré-scopé) aurait un org nul → INSERT rejeté.
    const reunion = await enOrg(ORG_A, () =>
      client.reunion.create({ data: { date: new Date('2026-01-01T00:00:00Z'), lieu: 'Salle' } }),
    )
    expect(reunion.organisationId).toBe(ORG_A)
    await enOrg(ORG_A, () =>
      client.pointOrdreDuJour.createMany({ data: [{ reunionId: reunion.id, titre: 'P', ordre: 0 }] }),
    )
    const point = await base.pointOrdreDuJour.findFirst({ where: { reunionId: reunion.id } })
    expect(point?.organisationId).toBe(ORG_A)
    await base.pointOrdreDuJour.deleteMany({ where: { reunionId: reunion.id } })
    await base.reunion.delete({ where: { id: reunion.id } })
  })

  it('create scopé du join : un lien créé en ORG_A porte organisationId = ORG_A', async () => {
    const conflit = await base.conflit.create({
      data: { organisationId: ORG_A, titre: 't2', description: 'd', niveauConfidentialite: 'PUBLIC', auteurId: auteurAId },
    })
    // createMany top-level en contexte ORG_A → organisationId injecté automatiquement.
    await enOrg(ORG_A, () =>
      client.conflitMembreConcerne.createMany({ data: [{ conflitId: conflit.id, membreId: membreAId }] }),
    )
    const lien = await base.conflitMembreConcerne.findUnique({
      where: { conflitId_membreId: { conflitId: conflit.id, membreId: membreAId } },
    })
    expect(lien?.organisationId).toBe(ORG_A)
    await base.conflit.delete({ where: { id: conflit.id } })
  })
})
