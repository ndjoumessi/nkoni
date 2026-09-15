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
 * Vitest exécute les fichiers de test EN PARALLÈLE sur la même base partagée : `executerRelancesForfaitToutesOrgs`,
 * `executerRappelsReunionsToutesOrgs`, `executerVerificationRetardsToutesOrgs` et
 * `reconcilierPaiementsToutesOrgs` bouclent RÉELLEMENT sur TOUTES les organisations actives de la base,
 * y compris les fixtures d'autres fichiers en cours d'exécution (ex. `forfait-relances.integration.test.ts`
 * crée une organisation à l'étape J-7 et s'attend à `notifies === 1` — si CE fichier a déjà traité cette
 * organisation entre-temps, la notification existe déjà et le décompte tombe à 0). Pour ne pas polluer les
 * fixtures des autres fichiers ET rester une preuve contre la VRAIE base, chaque tâche reçoit ici un Proxy
 * du client étendu : `organisation.findMany` exécute la VRAIE requête Postgres (le `where` du service reste
 * prouvé), enregistre les ids BRUTS renvoyés AVANT filtrage, puis ne restitue à la tâche que les lignes dont
 * l'id est parmi NOS deux organisations de fixture — tout le reste (tous les autres modèles, `$transaction`,
 * etc.) passe intégralement par le VRAI client étendu (`prismaEtendu`), sans changement de comportement.
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`).
 */

const ORG_REELLE = 'e8000000-0000-4000-8000-000000000081'
const ORG_DEMO = 'e8000000-0000-4000-8000-000000000082'
const IDS_AUTORISES = new Set([ORG_REELLE, ORG_DEMO])
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

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Enveloppe `prismaEtendu` : un Proxy transparent, sauf sur `organisation.findMany` qui exécute la
 * VRAIE requête puis restreint le résultat rendu à la tâche à `IDS_AUTORISES`. `bruts` reçoit les ids
 * TELS QUE Postgres les a renvoyés, AVANT ce filtrage — c'est ce qui permet de distinguer « le service
 * filtre bien `estDemo` » (la démo n'apparaît pas dans `bruts`) de « le Proxy masque la démo à notre
 * place » (elle y apparaîtrait). Chaque fonction est `.bind()`ée sur son objet d'origine pour préserver
 * le `this` attendu par le client Prisma.
 */
function creerPrismaScope(bruts: string[]): typeof prismaEtendu {
  const lier = (cible: any, prop: PropertyKey) => {
    const valeur = Reflect.get(cible, prop)
    return typeof valeur === 'function' ? valeur.bind(cible) : valeur
  }
  return new Proxy(prismaEtendu, {
    get(cible, prop) {
      if (prop !== 'organisation') return lier(cible, prop)
      const delegate = Reflect.get(cible, prop) as any
      return new Proxy(delegate, {
        get(cibleDelegate, propDelegate) {
          if (propDelegate !== 'findMany') return lier(cibleDelegate, propDelegate)
          return async (args: any) => {
            const reel: { id: string }[] = await delegate.findMany(args)
            bruts.push(...reel.map((o) => o.id))
            return reel.filter((o) => IDS_AUTORISES.has(o.id))
          }
        },
      })
    },
  }) as any
}

describe('tâches de fond — organisation de démonstration écartée', () => {
  it('retards de cotisation', async () => {
    const bruts: string[] = []
    const r = ids(await executerVerificationRetardsToutesOrgs(creerPrismaScope(bruts) as any, anneeCouranteApp(NOW), NOW))
    expect(bruts).toContain(ORG_REELLE)
    expect(bruts).not.toContain(ORG_DEMO)
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('rappels de réunion', async () => {
    const bruts: string[] = []
    const r = ids(await executerRappelsReunionsToutesOrgs(creerPrismaScope(bruts) as any, NOW))
    expect(bruts).toContain(ORG_REELLE)
    expect(bruts).not.toContain(ORG_DEMO)
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('relances de forfait', async () => {
    const bruts: string[] = []
    const r = ids(await executerRelancesForfaitToutesOrgs(creerPrismaScope(bruts) as any, NOW))
    expect(bruts).toContain(ORG_REELLE)
    expect(bruts).not.toContain(ORG_DEMO)
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('réconciliation des paiements', async () => {
    const bruts: string[] = []
    const psp = new Proxy({}, { get: () => async () => { throw new Error('aucun appel PSP attendu') } })
    const r = ids(await reconcilierPaiementsToutesOrgs({ prisma: creerPrismaScope(bruts) as any, psp: psp as any }, NOW))
    expect(bruts).toContain(ORG_REELLE)
    expect(bruts).not.toContain(ORG_DEMO)
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })
})
