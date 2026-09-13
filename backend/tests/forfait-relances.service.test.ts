/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import {
  cleRelanceForfait,
  executerRelancesForfait,
  executerRelancesForfaitToutesOrgs,
} from '../src/services/forfait-relances.service'
import { finDeJourneeApp } from '../src/lib/date-app'
import { orgContext } from '../src/lib/org-context'

/**
 * Relances d'échéance (spec 1.1 §4.1). Horloge FIXE : 13 septembre 2026, 11 h à Douala.
 * Le mock APPLIQUE les filtres `role in` / `actif` et ENREGISTRE le `where` reçu : un mock qui les
 * ignorerait laisserait passer une requête sans filtre de rôle (tous les comptes relancés).
 */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

interface Compte { id: string; email: string; role: string; actif?: boolean; langue?: 'FR' | 'EN' | null }

const COMPTES: Compte[] = [
  { id: 'u-admin', email: 'admin@exemple.test', role: 'ADMIN' },
  { id: 'u-pres', email: 'pres@exemple.test', role: 'PRESIDENT', langue: 'EN' },
  { id: 'u-tres', email: 'tres@exemple.test', role: 'TRESORIERE' },
  { id: 'u-membre', email: 'membre@exemple.test', role: 'MEMBRE_SIMPLE' },
  { id: 'u-admin-inactif', email: 'ancien@exemple.test', role: 'ADMIN', actif: false },
]

function mock(options: { notifs?: any[]; organisations?: any[] } = {}) {
  const notifs: any[] = [...(options.notifs ?? [])]
  const appels = { findManyWhere: [] as any[], contextes: [] as (string | undefined)[] }
  const prisma: any = {
    notification: {
      create: async ({ data }: any) => { notifs.push({ id: `n${notifs.length}`, ...data }); return data },
      findFirst: async ({ where }: any) =>
        notifs.find((n) => Object.entries(where).every(([k, v]) => n[k] === v)) ?? null,
      findMany: async () => notifs,
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      count: async () => notifs.length,
    },
    membre: { findUnique: async () => null },
    utilisateur: {
      findMany: async ({ where }: any) => {
        appels.findManyWhere.push(where)
        appels.contextes.push(orgContext.organisationId())
        return COMPTES.filter(
          (c) => where.role.in.includes(c.role) && (c.actif ?? true) === where.actif,
        ).map((c) => ({ id: c.id, email: c.email }))
      },
      findUnique: async ({ where }: any) => {
        const c = COMPTES.find((x) => x.id === where.id)
        return c ? { langue: c.langue ?? null, organisation: { langueDefaut: 'FR' } } : null
      },
      update: async () => ({}),
    },
    organisation: { findMany: async () => options.organisations ?? [] },
  }
  return { prisma, notifs, appels }
}

const ORG = (expireLe: Date | null, forfait = 'PRO') => ({ id: 'org-1', forfait, forfaitExpireLe: expireLe })

describe('executerRelancesForfait', () => {
  it('J-7 : notifie les seuls ADMIN et PRESIDENT actifs, dans leur langue, et prépare push + e-mail', async () => {
    const { prisma, notifs, appels } = mock()
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)

    expect(appels.findManyWhere[0]).toEqual({ role: { in: ['ADMIN', 'PRESIDENT'] }, actif: true })
    expect(r.etape).toBe('J7')
    expect(r.notifies).toBe(2)
    expect(notifs.map((n) => n.destinataireId).sort()).toEqual(['u-admin', 'u-pres'])
    const cle = cleRelanceForfait('org-1', fin('2026-09-20'), 'J7')
    expect(notifs.every((n) => n.type === 'FORFAIT_ECHEANCE' && n.entiteType === 'Organisation' && n.entiteId === cle)).toBe(true)

    const fr = notifs.find((n) => n.destinataireId === 'u-admin')
    expect(fr.message).toContain('20 septembre 2026')
    expect(fr.message).toContain('Pro')
    const en = notifs.find((n) => n.destinataireId === 'u-pres')
    expect(en.message).toContain('September 20, 2026')

    expect(r.aPousser.map((p) => p.destinataireId).sort()).toEqual(['u-admin', 'u-pres'])
    expect(r.aEnvoyer.map((e) => e.email).sort()).toEqual(['admin@exemple.test', 'pres@exemple.test'])
    // Corps de l'e-mail = message + pied (renvoi vers Paramètres), sujet = titre.
    const mailFr = r.aEnvoyer.find((e) => e.email === 'admin@exemple.test')!
    expect(mailFr.sujet).toBe(fr.titre)
    expect(mailFr.texte.startsWith(fr.message)).toBe(true)
    expect(mailFr.texte).toContain('Paramètres')
  })

  it('dédoublonné : une seconde nuit à la même étape ne recrée rien', async () => {
    const { prisma, notifs } = mock()
    await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, new Date('2026-09-14T10:00:00Z'))
    expect(r.notifies).toBe(0)
    expect(r.aPousser).toEqual([])
    expect(r.aEnvoyer).toEqual([])
    expect(notifs).toHaveLength(2)
  })

  it('nuit(s) manquée(s) : seule l’étape la plus récente part, pas de rattrapage', async () => {
    const { prisma, notifs } = mock()
    // Échéance au 18/09 (J = 5) : J-30 jamais envoyée → seule J-7 part.
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-18')) as any, NOW)
    expect(r.etape).toBe('J7')
    expect(new Set(notifs.map((n) => n.entiteId))).toEqual(new Set([cleRelanceForfait('org-1', fin('2026-09-18'), 'J7')]))
  })

  it('réarmement : une prolongation change la clé, le cycle repart', async () => {
    const { prisma } = mock()
    await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)
    // Prolongé d'un mois (20/10, J = 37) : rien ; plus tard, à J-30 de la NOUVELLE échéance, relance.
    expect((await executerRelancesForfait(prisma, ORG(fin('2026-10-20')) as any, NOW)).notifies).toBe(0)
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-10-20')) as any, new Date('2026-09-21T10:00:00Z'))
    expect(r.etape).toBe('J30')
    expect(r.notifies).toBe(2)
  })

  it('grâce : message avec la fin de grâce', async () => {
    const { prisma, notifs } = mock()
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-12')) as any, NOW)
    expect(r.etape).toBe('GRACE')
    expect(notifs.find((n) => n.destinataireId === 'u-admin').message).toContain('26 septembre 2026')
  })

  it.each([
    ['actif (J = 40)', ORG(fin('2026-10-23'))],
    ['expiré au-delà de la grâce', ORG(fin('2026-08-24'))],
    ['sans échéance', ORG(null)],
    ['GRATUIT', ORG(fin('2026-09-20'), 'GRATUIT')],
  ])('%s → rien, sans même lire les comptes', async (_nom, org) => {
    const { prisma, notifs, appels } = mock()
    const r = await executerRelancesForfait(prisma, org as any, NOW)
    expect(r).toEqual({ organisationId: 'org-1', etape: null, notifies: 0, aPousser: [], aEnvoyer: [] })
    expect(notifs).toHaveLength(0)
    expect(appels.findManyWhere).toHaveLength(0)
  })
})

describe('executerRelancesForfaitToutesOrgs', () => {
  it('lit les organisations actives payantes avec échéance, et traite chacune DANS son contexte', async () => {
    const orgs = [
      { id: 'org-a', forfait: 'PRO', forfaitExpireLe: fin('2026-09-20') },
      { id: 'org-b', forfait: 'ENTREPRISE', forfaitExpireLe: fin('2026-09-12') },
    ]
    const { prisma, appels } = mock({ organisations: orgs })
    let whereOrgs: any
    const findManyOrgs = prisma.organisation.findMany
    prisma.organisation.findMany = async (args: any) => { whereOrgs = args; return findManyOrgs(args) }

    const r = await executerRelancesForfaitToutesOrgs(prisma, NOW)

    expect(whereOrgs.where).toEqual({ actif: true, forfait: { not: 'GRATUIT' }, forfaitExpireLe: { not: null } })
    expect(r.map((x) => [x.organisationId, x.etape])).toEqual([['org-a', 'J7'], ['org-b', 'GRACE']])
    expect(appels.contextes).toEqual(['org-a', 'org-b'])
  })
})
