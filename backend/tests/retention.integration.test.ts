import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { purgerRetention, seuilRetention, type RetentionPrisma } from '../src/services/retention.service'

/**
 * Purge de rétention (GA 0.3, politique §2.4) contre une VRAIE Postgres, via le client ÉTENDU
 * (extension d'isolation active) : c'est lui que la tâche de nuit utilise. Prouve ce qu'un mock ne
 * peut pas : les comparaisons de dates en base, le scoping réel de chaque `deleteMany`, et qu'aucune
 * ligne récente ni aucune ligne d'une autre organisation ne disparaît.
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`). ⚠️ La purge parcourt TOUTES les organisations
 * et tout le journal plateforme de la base visée : le test REFUSE de tourner si le nom de la base ne
 * désigne pas une base de test (`_it_` ou `test`), pour ne jamais purger une base de développement
 * pointée par `.env`.
 */

const ORG_A = 'e7000000-0000-4000-8000-000000000071'
const ORG_B = 'e7000000-0000-4000-8000-000000000072'
// Horloge RÉELLE : la purge compare l'horloge du process à celle de Postgres.
const NOW = new Date()
const ACTEUR_PLATEFORME = 'e7000000-0000-4000-8000-0000000000ff'

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const comptes: Record<string, string> = {}

const il_y_a = (mois: number, jours = 0): Date => {
  const d = new Date(NOW)
  d.setUTCMonth(d.getUTCMonth() - mois)
  d.setUTCDate(d.getUTCDate() - jours)
  return d
}

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) {
    throw new Error(`retention.integration : base « ${nom} » refusée (la purge est globale) — utiliser une base jetable`)
  }
}

async function nettoyer(): Promise<void> {
  await base.notification.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.auditLog.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.platformAuditLog.deleteMany({ where: { acteurId: ACTEUR_PLATEFORME } })
  await base.utilisateur.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } })
  await base.organisation.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

async function semer(org: string): Promise<void> {
  const u = await base.utilisateur.create({
    data: { organisationId: org, email: `retention-${org.slice(-2)}@retention-it.local`, passwordHash: 'x', role: 'ADMIN', actif: true },
  })
  comptes[org] = u.id
  const notif = (titre: string, dateCreation: Date) => ({
    organisationId: org, destinataireId: u.id, type: 'COTISATION_RETARD' as const, titre, message: 'fictif', dateCreation,
  })
  const seuil = seuilRetention(NOW, 12)
  await base.notification.createMany({
    data: [
      notif('vieille', il_y_a(12, 2)),
      { ...notif('masquée vieille', il_y_a(13)), masqueeLe: il_y_a(12, 20) },
      notif('juste expirée', new Date(seuil.getTime() - 1000)),
      notif('juste conservée', new Date(seuil.getTime() + 1000)),
      notif('douze mois moins une heure', new Date(il_y_a(12).getTime() + 3_600_000)),
      notif('récente', il_y_a(11)),
    ],
  })
  const audit = (entiteId: string, dateAction: Date) => ({
    organisationId: org, entiteType: 'Membre', entiteId, action: 'UPDATE' as const, acteurId: u.id, dateAction,
  })
  await base.auditLog.createMany({
    data: [audit('vieux', il_y_a(24, 2)), audit('récent', il_y_a(23))],
  })
}

beforeAll(async () => {
  exigerBaseDeTest()
  await nettoyer()
  await base.organisation.create({ data: { id: ORG_A, nom: 'Rétention A (fictive)', devise: 'FCFA' } })
  await base.organisation.create({ data: { id: ORG_B, nom: 'Rétention B (fictive)', devise: 'FCFA', actif: false } })
  await semer(ORG_A)
  await semer(ORG_B)
  const trace = (organisationNom: string, dateAction: Date) => ({
    acteurId: ACTEUR_PLATEFORME, acteurEmail: 'plateforme@retention-it.local', action: 'SUSPENDRE' as const,
    organisationCibleId: ORG_A, organisationNom, dateAction,
  })
  await base.platformAuditLog.createMany({
    data: [trace('vieille', il_y_a(60, 2)), trace('récente', il_y_a(59))],
  })
})

afterAll(async () => {
  if (/_it_|test/.test(new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname)) await nettoyer()
  await base.$disconnect()
  await prismaEtendu.$disconnect()
})

describe('purgerRetention — vraie Postgres, client étendu', () => {
  it('supprime seulement les lignes expirées, dans chaque organisation (active ou suspendue)', async () => {
    const r = await purgerRetention(prismaEtendu as unknown as RetentionPrisma, NOW)

    for (const org of [ORG_A, ORG_B]) {
      const notifs = await base.notification.findMany({ where: { organisationId: org }, select: { titre: true } })
      expect(notifs.map((n) => n.titre).sort()).toEqual(['douze mois moins une heure', 'juste conservée', 'récente'])
      const audits = await base.auditLog.findMany({ where: { organisationId: org }, select: { entiteId: true } })
      expect(audits.map((a) => a.entiteId)).toEqual(['récent'])
      const resultat = r.organisations.find((o) => o.organisationId === org)
      expect(resultat).toEqual({ organisationId: org, notifications: 3, auditLogs: 1 })
    }

    const traces = await base.platformAuditLog.findMany({
      where: { acteurId: ACTEUR_PLATEFORME },
      select: { organisationNom: true },
    })
    expect(traces.map((t) => t.organisationNom)).toEqual(['récente'])
    expect(r.platformAuditLogs).toBeGreaterThanOrEqual(1)
  })

  it('rejouée la nuit suivante : rien de plus à supprimer (idempotente)', async () => {
    const r = await purgerRetention(prismaEtendu as unknown as RetentionPrisma, NOW)
    for (const org of [ORG_A, ORG_B]) {
      expect(r.organisations.find((o) => o.organisationId === org)).toEqual({
        organisationId: org, notifications: 0, auditLogs: 0,
      })
    }
    expect(await base.notification.count({ where: { organisationId: { in: [ORG_A, ORG_B] } } })).toBe(6)
  })
})
