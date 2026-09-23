import { describe, it, expect } from 'vitest'
import { avecIsolation } from './support/isolation-de-test'
import { orgContext } from '../src/lib/org-context'
import { TenantContextError } from '../src/lib/tenant-extension'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Le seam de test déplacé : un mock enveloppé passe par la VRAIE extension d'isolation.
 *
 * Ce fichier est la preuve que l'enveloppe fait ce qu'elle prétend. Sans lui, `avecIsolation`
 * serait un troisième mécanisme à croire sur parole — exactement le défaut qu'il corrige.
 */

/** Mock minimal : il enregistre les `args` REÇUS, après passage de l'extension. */
function mockEspion(lignes: any[] = []) {
  const vus: Record<string, any> = {}
  return {
    vus,
    membre: {
      findMany: async (args: any) => {
        vus['findMany'] = args
        return lignes
      },
      findUnique: async (args: any) => {
        vus['findUnique'] = args
        return lignes.find((l) => l.id === args?.where?.id) ?? null
      },
      create: async (args: any) => {
        vus['create'] = args
        return args.data
      },
    },
    // Modèle NON scopé : l'extension doit le laisser passer intact.
    organisation: {
      findUnique: async (args: any) => {
        vus['orgFindUnique'] = args
        return { id: 'org-1', nom: 'Test' }
      },
    },
    $transaction: async (fn: any) => fn({ membre: { create: async (a: any) => a.data } }),
  }
}

const dansOrg = <T>(orgId: string, fn: () => Promise<T>) =>
  orgContext.run({ organisationId: orgId }, fn)

describe('avecIsolation — le mock passe par la vraie extension', () => {
  it('INJECTE `organisationId` dans le `where` d’une lecture de masse', async () => {
    const m = mockEspion()
    const p = avecIsolation(m)
    await dansOrg('org-1', async () => p.membre.findMany({ where: { statut: 'ACTIF' } }))
    expect(m.vus['findMany'].where).toEqual({ statut: 'ACTIF', organisationId: 'org-1' })
  })

  it('ÉCRASE un `organisationId` fourni par l’appelant — pas de contournement', async () => {
    const m = mockEspion()
    const p = avecIsolation(m)
    await dansOrg('org-1', async () => p.membre.findMany({ where: { organisationId: 'org-2' } }))
    expect(m.vus['findMany'].where.organisationId).toBe('org-1')
  })

  it('FORCE `organisationId` sur un `create`', async () => {
    const m = mockEspion()
    const p = avecIsolation(m)
    await dansOrg('org-1', async () => p.membre.create({ data: { nom: 'Ngo', organisationId: 'org-2' } }))
    expect(m.vus['create'].data.organisationId).toBe('org-1')
  })

  it('POST-FILTRE un `findUnique` : la ligne d’une AUTRE org devient `null`', async () => {
    // C'est LE cas que la revue pointait : sans enveloppe, ce 404 venait du mock, pas du code.
    const p = avecIsolation(mockEspion([{ id: 'm1', organisationId: 'org-2', nom: 'Autre' }]))
    const res = await dansOrg('org-1', async () => p.membre.findUnique({ where: { id: 'm1' } }))
    expect(res).toBeNull()
  })

  it('rend la ligne quand elle appartient à l’organisation courante', async () => {
    const p = avecIsolation(mockEspion([{ id: 'm1', organisationId: 'org-1', nom: 'Mien' }]))
    const res = await dansOrg('org-1', async () => p.membre.findUnique({ where: { id: 'm1' } }))
    expect(res).toMatchObject({ id: 'm1', nom: 'Mien' })
  })

  it('FAIL-CLOSE hors contexte d’organisation', async () => {
    const p = avecIsolation(mockEspion())
    await expect(p.membre.findMany({})).rejects.toBeInstanceOf(TenantContextError)
  })

  it('laisse passer `runUnscoped` — le bypass délibéré reste délibéré', async () => {
    const m = mockEspion()
    const p = avecIsolation(m)
    await orgContext.runUnscoped(async () => p.membre.findMany({ where: { statut: 'ACTIF' } }))
    expect(m.vus['findMany'].where).toEqual({ statut: 'ACTIF' })
  })

  it('ne touche PAS un modèle non scopé (`Organisation`)', async () => {
    const m = mockEspion()
    const p = avecIsolation(m)
    // Sans contexte d'org, et pourtant : aucune levée, aucun `where` injecté.
    await p.organisation.findUnique({ where: { id: 'org-1' } })
    expect(m.vus['orgFindUnique'].where).toEqual({ id: 'org-1' })
  })

  it('enveloppe AUSSI le `tx` d’un `$transaction` interactif', async () => {
    // Sans ça, la majorité des écritures métier de ce dépôt — qui passent par une transaction —
    // échapperaient à l'isolation dans les tests, et l'enveloppe donnerait une fausse assurance.
    const p = avecIsolation(mockEspion())
    const cree = await dansOrg('org-1', async () =>
      p.$transaction(async (tx: any) => tx.membre.create({ data: { nom: 'Dans tx' } })),
    )
    expect(cree).toMatchObject({ nom: 'Dans tx', organisationId: 'org-1' })
  })
})
