import { describe, it, expect } from 'vitest'
import {
  journaliserActionPlateforme,
  listerJournalPlateforme,
  PLAFOND_JOURNAL_PLATEFORME,
  type JournalPlateformeEntree,
} from '../src/services/platform-audit.service'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Journal d'audit PLATEFORME (dette 0.3) — fonctions pures/service, Prisma mocké.
 * Vérifie : le SNAPSHOT `acteurEmail` (résolu à l'écriture, repli `(inconnu)`), et la lecture
 * bornée avec drapeau de troncature (même logique que `PLAFOND_STATUTS_MEMBRES`).
 */

describe('journaliserActionPlateforme', () => {
  it('résout et fige `acteurEmail` (snapshot) au moment de l’écriture', async () => {
    const creations: any[] = []
    const prisma = {
      utilisateur: { findUnique: async () => ({ email: 'sa@nkoni.test' }) },
      platformAuditLog: { create: async (a: any) => (creations.push(a.data), a.data) },
    }
    await journaliserActionPlateforme(prisma, {
      acteurId: 'sa-1',
      action: 'CHANGER_FORFAIT',
      organisationCibleId: 'org-a',
      organisationNom: 'WAMBA TCHOUPA',
      donneesAvant: { forfait: 'GRATUIT' },
      donneesApres: { forfait: 'PRO' },
    })
    expect(creations).toHaveLength(1)
    expect(creations[0]).toMatchObject({
      acteurId: 'sa-1',
      acteurEmail: 'sa@nkoni.test',
      action: 'CHANGER_FORFAIT',
      organisationCibleId: 'org-a',
      organisationNom: 'WAMBA TCHOUPA',
      donneesAvant: { forfait: 'GRATUIT' },
      donneesApres: { forfait: 'PRO' },
    })
  })

  it('repli `(inconnu)` si l’acteur est introuvable — n’empêche jamais l’écriture de la trace', async () => {
    const creations: any[] = []
    const prisma = {
      utilisateur: { findUnique: async () => null },
      platformAuditLog: { create: async (a: any) => (creations.push(a.data), a.data) },
    }
    await journaliserActionPlateforme(prisma, {
      acteurId: 'sa-x',
      action: 'PURGER',
      organisationCibleId: 'org-z',
      organisationNom: 'Défunte',
    })
    expect(creations[0].acteurEmail).toBe('(inconnu)')
  })
})

describe('listerJournalPlateforme (borné)', () => {
  const faire = (n: number): JournalPlateformeEntree[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      acteurId: 'sa-1',
      acteurEmail: 'sa@nkoni.test',
      action: 'SUSPENDRE',
      organisationCibleId: 'org-a',
      organisationNom: 'Org',
      donneesAvant: { actif: true },
      donneesApres: { actif: false },
      dateAction: new Date('2026-07-22T00:00:00Z'),
    }))

  it('transmet le filtre action + org et borne à `limite`, `tronque` si total dépasse', async () => {
    let whereCapture: any
    let takeCapture: number | undefined
    const prisma = {
      platformAuditLog: {
        count: async ({ where }: any) => ((whereCapture = where), 250),
        findMany: async ({ take }: any) => ((takeCapture = take), faire(take)),
      },
    }
    const res = await listerJournalPlateforme(prisma, { action: 'SUSPENDRE', organisationCibleId: 'org-a' }, 200)
    expect(whereCapture).toEqual({ action: 'SUSPENDRE', organisationCibleId: 'org-a' })
    expect(takeCapture).toBe(200)
    expect(res.items).toHaveLength(200)
    expect(res.total).toBe(250)
    expect(res.tronque).toBe(true) // 250 > 200
  })

  it('sans filtre : `where` vide, `tronque=false` si total ≤ limite ; défaut = PLAFOND', async () => {
    let whereCapture: any
    let takeCapture: number | undefined
    const prisma = {
      platformAuditLog: {
        count: async ({ where }: any) => ((whereCapture = where), 12),
        findMany: async ({ take }: any) => ((takeCapture = take), faire(12)),
      },
    }
    const res = await listerJournalPlateforme(prisma)
    expect(whereCapture).toEqual({})
    expect(takeCapture).toBe(PLAFOND_JOURNAL_PLATEFORME)
    expect(res.total).toBe(12)
    expect(res.tronque).toBe(false)
  })
})
