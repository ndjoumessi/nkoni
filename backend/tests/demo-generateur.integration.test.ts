import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { anneeCouranteApp } from '../src/lib/date-app'
import { reconcilierVersements } from '../src/services/versement.service'
import { calculerStatutsMembres } from '../src/services/membreStatut.service'
import { construireMembresDemo, planifierVersementsDemo, NOM_ORGANISATION_DEMO } from '../src/services/demo-donnees'
import { genererOrganisationDemo, type OrganisationDemoGeneree } from '../src/services/demo-generateur.service'
import { supprimerOrganisationDemo } from '../src/services/demo-suppression.service'
import { envelopperPrisma } from './support/prisma-espion'

/**
 * Spec 2026-09-15 §3.1, contre une VRAIE Postgres : la démo générée par les services réels respecte les
 * invariants financiers (réconciliation sans écart), produit les statuts voulus, n'envoie rien, et une
 * génération interrompue ne laisse aucune organisation derrière elle.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blob = { del: async () => undefined }
const NOW = new Date()
const ANNEE = anneeCouranteApp(NOW)
let demo: OrganisationDemoGeneree
// `PlatformAuditLog` est délibérément HORS `ORDRE_SUPPRESSION` (journal plateforme, jamais de
// relation vers `Organisation`) : la suppression d'une démo laisse donc sa trace `SUPPRIMER_DEMO`
// dans la base partagée si personne ne la nettoie. Toute organisation créée par ce fichier — la
// démo principale ET celles des tests de panne — est enregistrée ici pour un nettoyage en `afterAll`.
const organisationsCreees: string[] = []

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-generateur.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

beforeAll(async () => {
  exigerBaseDeTest()
  demo = await genererOrganisationDemo(prismaEtendu, blob, NOW)
  organisationsCreees.push(demo.organisationId)
}, 300_000)

afterAll(async () => {
  if (demo) await supprimerOrganisationDemo(prismaEtendu, blob, demo.organisationId)
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: { in: organisationsCreees } } })
  await base.$disconnect()
}, 120_000)

describe('genererOrganisationDemo', () => {
  it('organisation démo ACTIVE, forfait PRO sans échéance, compte admin lié à la présidente, cheffe désignée', async () => {
    const org = await base.organisation.findUnique({ where: { id: demo.organisationId } })
    expect(org).toMatchObject({ nom: NOM_ORGANISATION_DEMO, estDemo: true, actif: true, forfait: 'PRO', forfaitExpireLe: null })
    const presidente = await base.membre.findFirst({ where: { organisationId: demo.organisationId, compteUtilisateurId: demo.adminId } })
    expect(presidente).not.toBeNull()
    expect(org?.chefMembreId).toBe(presidente?.id)
    const compte = await base.utilisateur.findUnique({ where: { id: demo.adminId } })
    expect(compte?.email).toMatch(/@demo\.nkoni\.invalid$/)
  })

  it('réconciliation des versements : zéro écart', async () => {
    const ecarts = await orgContext.run({ organisationId: demo.organisationId }, async () => await reconcilierVersements(prismaEtendu))
    expect(ecarts).toEqual([])
  })

  it('statuts de cotisation des actifs : 25 à jour, 11 partiels, 6 non à jour', async () => {
    const { items } = await orgContext.run({ organisationId: demo.organisationId }, async () => await calculerStatutsMembres(prismaEtendu, ANNEE))
    const actifs = items.filter((m) => m.statut === 'ACTIF')
    expect(actifs).toHaveLength(42)
    expect(actifs.filter((m) => m.statutCotisation === 'A_JOUR')).toHaveLength(25)
    expect(actifs.filter((m) => m.statutCotisation === 'PARTIEL')).toHaveLength(11)
    expect(actifs.filter((m) => m.statutCotisation === 'NON_A_JOUR')).toHaveLength(6)
  })

  it('volumes en base conformes au plan, un reçu annulé et réémis', async () => {
    const id = demo.organisationId
    const versementsAttendus = planifierVersementsDemo(construireMembresDemo(ANNEE), ANNEE, NOW).length
    expect(await base.membre.count({ where: { organisationId: id } })).toBe(45)
    expect(await base.versement.count({ where: { organisationId: id } })).toBe(versementsAttendus)
    expect(await base.recu.count({ where: { organisationId: id, annuleLe: null } })).toBe(versementsAttendus)
    expect(await base.recu.count({ where: { organisationId: id, annuleLe: { not: null } } })).toBe(1)
    expect(await base.depense.count({ where: { organisationId: id } })).toBe(8)
    expect(await base.amende.count({ where: { organisationId: id } })).toBe(3)
    expect(await base.donCagnotte.count({ where: { organisationId: id } })).toBe(12)
    expect(await base.reunion.count({ where: { organisationId: id } })).toBe(2)
    expect(await base.vote.count({ where: { organisationId: id } })).toBe(20)
    expect(await base.tourTontine.count({ where: { organisationId: id, statut: 'REVERSE' } })).toBe(5)
    expect(demo.volumes).toMatchObject({ membres: 45, versements: versementsAttendus, recus: versementsAttendus + 1, recusAnnules: 1, depenses: 8, dons: 12, amendes: 3, votes: 20 })
  })

  it('n’envoie rien : aucune notification, aucun paiement en ligne, aucun PDF de reçu produit', async () => {
    const id = demo.organisationId
    expect(await base.notification.count({ where: { organisationId: id } })).toBe(0)
    expect(await base.paiement.count({ where: { organisationId: id } })).toBe(0)
    expect(await base.recu.count({ where: { organisationId: id, urlPdf: { not: null } } })).toBe(0)
  })

  it('génération interrompue au milieu : l’organisation partielle est supprimée et l’erreur remonte', async () => {
    let organisationCree: string | undefined
    const enPanne = envelopperPrisma(prismaEtendu, {
      organisation: {
        update: async (originale, args) => {
          organisationCree ??= args.where.id
          return originale(args)
        },
      },
      tontine: {
        create: async () => {
          throw new Error('panne simulée pendant la tontine')
        },
      },
    })
    await expect(genererOrganisationDemo(enPanne, blob, NOW)).rejects.toThrow('panne simulée pendant la tontine')
    expect(organisationCree).toBeDefined()
    organisationsCreees.push(organisationCree!)
    expect(await base.organisation.findUnique({ where: { id: organisationCree! } })).toBeNull()
  }, 300_000)

  it('panne AVANT même le marquage estDemo : repli de nettoyage, aucune organisation ni utilisateur ne reste', async () => {
    let organisationCree: string | undefined
    const enPanne = envelopperPrisma(prismaEtendu, {
      organisation: {
        update: async (_originale, args) => {
          organisationCree ??= args.where.id
          throw new Error('panne simulée avant le marquage')
        },
      },
    })
    await expect(genererOrganisationDemo(enPanne, blob, NOW)).rejects.toThrow('panne simulée avant le marquage')
    expect(organisationCree).toBeDefined()
    organisationsCreees.push(organisationCree!)
    expect(await base.organisation.findUnique({ where: { id: organisationCree! } })).toBeNull()
    expect(await base.utilisateur.count({ where: { organisationId: organisationCree! } })).toBe(0)
  }, 300_000)
})
