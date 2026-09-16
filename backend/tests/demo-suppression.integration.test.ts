import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import {
  ACTEUR_SYSTEME_DEMO,
  OrganisationNonDemoError,
  supprimerOrganisationDemo,
} from '../src/services/demo-suppression.service'

/**
 * Spec 2026-09-15 §3.2 — la suppression d'une démo ne passe pas par la précondition HUMAINE de la purge
 * (suspension + nom), elle relit `estDemo` dans la transaction et refuse toute organisation réelle.
 * Contre une vraie Postgres : ce sont les clés étrangères et le scoping réel des `deleteMany` qui comptent.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const ORG_DEMO = 'e9000000-0000-4000-8000-000000000091'
const ORG_REELLE = 'e9000000-0000-4000-8000-000000000092'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blobsSupprimes: string[] = []
const blob = { del: async (url: string) => void blobsSupprimes.push(url) }

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-suppression.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

async function nettoyer(): Promise<void> {
  const ids = [ORG_DEMO, ORG_REELLE]
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: { in: ids } } })
  await base.membre.deleteMany({ where: { organisationId: { in: ids } } })
  await base.utilisateur.deleteMany({ where: { organisationId: { in: ids } } })
  await base.brancheFamiliale.deleteMany({ where: { organisationId: { in: ids } } })
  await base.organisation.deleteMany({ where: { id: { in: ids } } })
}

async function semer(id: string, estDemo: boolean): Promise<void> {
  await base.organisation.create({ data: { id, nom: `Suppression ${estDemo ? 'démo' : 'réelle'}`, devise: 'FCFA', estDemo } })
  const u = await base.utilisateur.create({
    data: { organisationId: id, email: `admin-${id.slice(-2)}@demo-suppression-it.local`, passwordHash: 'x', role: 'ADMIN', actif: true },
  })
  const branche = await base.brancheFamiliale.create({ data: { organisationId: id, nom: 'Branche' } })
  await base.membre.create({
    data: { organisationId: id, nom: 'Fictif', prenom: 'Membre', anneeAdhesion: 2026, brancheId: branche.id, compteUtilisateurId: u.id, photoBlobUrl: `https://blob.test/${id}.jpg` },
  })
}

const comptes = async (id: string) => ({
  organisation: await base.organisation.count({ where: { id } }),
  utilisateurs: await base.utilisateur.count({ where: { organisationId: id } }),
  membres: await base.membre.count({ where: { organisationId: id } }),
  branches: await base.brancheFamiliale.count({ where: { organisationId: id } }),
})

beforeAll(async () => {
  exigerBaseDeTest()
  await nettoyer()
  await semer(ORG_DEMO, true)
  await semer(ORG_REELLE, false)
})

afterAll(async () => {
  await nettoyer()
  await base.$disconnect()
})

describe('supprimerOrganisationDemo', () => {
  it('refuse une organisation réelle et n’y touche pas', async () => {
    const avant = await comptes(ORG_REELLE)
    await expect(supprimerOrganisationDemo(prismaEtendu, blob, ORG_REELLE)).rejects.toBeInstanceOf(OrganisationNonDemoError)
    expect(await comptes(ORG_REELLE)).toEqual(avant)
    expect(await base.organisation.findUnique({ where: { id: ORG_REELLE }, select: { actif: true } })).toEqual({ actif: true })
  })

  it('supprime la démo entière, ses blobs, et journalise l’acteur système', async () => {
    const reelleAvant = await comptes(ORG_REELLE)
    const r = await supprimerOrganisationDemo(prismaEtendu, blob, ORG_DEMO)
    expect(r.supprimee).toBe(true)
    expect(r.journalise).toBe(true)
    expect(await comptes(ORG_DEMO)).toEqual({ organisation: 0, utilisateurs: 0, membres: 0, branches: 0 })
    expect(blobsSupprimes).toContain(`https://blob.test/${ORG_DEMO}.jpg`)
    expect(await comptes(ORG_REELLE)).toEqual(reelleAvant)
    const trace = await base.platformAuditLog.findFirst({ where: { organisationCibleId: ORG_DEMO } })
    expect(trace).toMatchObject({ action: 'SUPPRIMER_DEMO', acteurId: ACTEUR_SYSTEME_DEMO.id, acteurEmail: ACTEUR_SYSTEME_DEMO.email })
  })

  it('identifiant inconnu (démo déjà supprimée) : rien à faire, pas d’erreur', async () => {
    expect(await supprimerOrganisationDemo(prismaEtendu, blob, ORG_DEMO)).toMatchObject({ supprimee: false })
  })
})
