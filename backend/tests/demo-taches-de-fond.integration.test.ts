import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { anneeCouranteApp } from '../src/lib/date-app'
import {
  executerRappelsReunionsToutesOrgs,
  executerVerificationRetardsToutesOrgs,
} from '../src/services/notification-scheduler'
import { executerRelancesForfaitToutesOrgs } from '../src/services/forfait-relances.service'
import { reconcilierPaiementsToutesOrgs } from '../src/services/paiement-reconciliation.service'

/**
 * Spec 2026-09-15 §1.5, contre une VRAIE Postgres : un mock ignore le `where`, seule la base prouve
 * que la démo est réellement écartée. Deux organisations identiques (actives, PRO avec échéance proche
 * pour être éligibles aux relances) ne diffèrent que par `estDemo` : chaque tâche doit traiter la
 * réelle et jamais la démo. Assertions par identifiant → indifférent aux autres organisations de la base.
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`).
 */

const ORG_REELLE = 'e8000000-0000-4000-8000-000000000081'
const ORG_DEMO = 'e8000000-0000-4000-8000-000000000082'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const NOW = new Date()

beforeAll(async () => {
  await base.organisation.deleteMany({ where: { id: { in: [ORG_REELLE, ORG_DEMO] } } })
  const echeance = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000)
  for (const [id, estDemo] of [[ORG_REELLE, false], [ORG_DEMO, true]] as const) {
    await base.organisation.create({
      data: { id, nom: `Taches de fond ${estDemo ? 'démo' : 'réelle'}`, devise: 'FCFA', forfait: 'PRO', forfaitExpireLe: echeance, estDemo },
    })
  }
})

afterAll(async () => {
  await base.organisation.deleteMany({ where: { id: { in: [ORG_REELLE, ORG_DEMO] } } })
  await base.$disconnect()
})

const ids = (resultats: { organisationId: string }[]) => resultats.map((r) => r.organisationId)

describe('tâches de fond — organisation de démonstration écartée', () => {
  it('retards de cotisation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerVerificationRetardsToutesOrgs(prismaEtendu as any, anneeCouranteApp(NOW), NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('rappels de réunion', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerRappelsReunionsToutesOrgs(prismaEtendu as any, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('relances de forfait', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerRelancesForfaitToutesOrgs(prismaEtendu as any, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('réconciliation des paiements', async () => {
    const psp = new Proxy({}, { get: () => async () => { throw new Error('aucun appel PSP attendu') } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await reconcilierPaiementsToutesOrgs({ prisma: prismaEtendu, psp: psp as any }, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })
})
