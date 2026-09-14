import { describe, it, expect } from 'vitest'
import { orgContext } from '../src/lib/org-context'
import {
  HorlogeRetentionInvalideError,
  RETENTION_MOIS,
  purgerRetention,
  seuilRetention,
  type RetentionPrisma,
} from '../src/services/retention.service'

/**
 * Purge de rétention (GA 0.3, politique §2.4) — seuils et FORME des suppressions. Les mocks n'ont pas
 * d'extension d'isolation : l'effet réel (scoping, dates en base) est prouvé en intégration
 * (`retention.integration.test.ts`). Ici on verrouille ce que le service CONSTRUIT lui-même.
 */

const NOW = new Date('2026-09-14T01:00:00Z') // 02:00 à Douala, le 14 septembre

interface Appel {
  modele: string
  where: Record<string, unknown>
  contexte: string | undefined
}

function prismaEspion(orgs: string[]): { prisma: RetentionPrisma; appels: Appel[] } {
  const appels: Appel[] = []
  const deleteMany = (modele: string) => async ({ where }: { where: Record<string, unknown> }) => {
    appels.push({ modele, where, contexte: orgContext.organisationId() })
    return { count: 1 }
  }
  return {
    appels,
    prisma: {
      organisation: { findMany: async () => orgs.map((id) => ({ id })) },
      notification: { deleteMany: deleteMany('notification') },
      auditLog: { deleteMany: deleteMany('auditLog') },
      platformAuditLog: { deleteMany: deleteMany('platformAuditLog') },
    },
  }
}

describe('seuilRetention', () => {
  it('recule du nombre de mois calendaires (jour applicatif Douala)', () => {
    expect(seuilRetention(NOW, 12).toISOString().slice(0, 10)).toBe('2025-09-14')
    expect(seuilRetention(NOW, 24).toISOString().slice(0, 10)).toBe('2024-09-14')
    expect(seuilRetention(NOW, 60).toISOString().slice(0, 10)).toBe('2021-09-14')
  })

  it('durées de la politique : 12 / 24 / 60 mois', () => {
    expect(RETENTION_MOIS).toEqual({ notification: 12, auditLog: 24, platformAuditLog: 60 })
  })

  it.each([
    ['date invalide', new Date('pas une date'), 12],
    ['durée sous le plancher de 12 mois', NOW, 11],
    ['durée nulle', NOW, 0],
    ['durée négative', NOW, -12],
    ['durée non entière', NOW, 12.5],
  ])('refuse : %s', (_nom, now, mois) => {
    expect(() => seuilRetention(now, mois)).toThrow(HorlogeRetentionInvalideError)
  })
})

describe('purgerRetention', () => {
  it('par organisation, SOUS son contexte, avec where.organisationId concordant et seuil de date', async () => {
    const { prisma, appels } = prismaEspion(['org-a', 'org-b'])
    const r = await purgerRetention(prisma, NOW)

    const parOrg = appels.filter((a) => a.modele !== 'platformAuditLog')
    expect(parOrg).toHaveLength(4)
    for (const a of parOrg) {
      expect(a.contexte).toBeDefined()
      expect(a.where['organisationId']).toBe(a.contexte)
    }
    expect(parOrg.map((a) => `${a.modele}@${a.contexte}`)).toEqual([
      'notification@org-a',
      'auditLog@org-a',
      'notification@org-b',
      'auditLog@org-b',
    ])
    const notif = parOrg[0]!
    expect(notif.where['dateCreation']).toEqual({ lt: seuilRetention(NOW, 12) })
    const audit = parOrg[1]!
    expect(audit.where['dateAction']).toEqual({ lt: seuilRetention(NOW, 24) })

    expect(r.organisations).toEqual([
      { organisationId: 'org-a', notifications: 1, auditLogs: 1 },
      { organisationId: 'org-b', notifications: 1, auditLogs: 1 },
    ])
  })

  it('journal plateforme : where borné par la date SEULE (jamais vide), hors contexte org', async () => {
    const { prisma, appels } = prismaEspion(['org-a'])
    const r = await purgerRetention(prisma, NOW)
    const plateforme = appels.filter((a) => a.modele === 'platformAuditLog')
    expect(plateforme).toHaveLength(1)
    expect(plateforme[0]!.where).toEqual({ dateAction: { lt: seuilRetention(NOW, 60) } })
    expect(plateforme[0]!.contexte).toBeUndefined()
    expect(r.platformAuditLogs).toBe(1)
  })

  it('horloge invalide : AUCUNE suppression, erreur remontée au scheduler', async () => {
    const { prisma, appels } = prismaEspion(['org-a'])
    await expect(purgerRetention(prisma, new Date(Number.NaN))).rejects.toThrow(HorlogeRetentionInvalideError)
    expect(appels).toHaveLength(0)
  })
})
