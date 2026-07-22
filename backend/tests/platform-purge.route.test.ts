import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { ORDRE_SUPPRESSION } from '../src/services/organisation-purge.service'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Routes de PURGE et d'EXPORT d'une organisation (bloquant GA 0.3), Prisma mocké.
 *
 * Ce fichier vérifie les VERROUS au niveau HTTP — c'est là qu'ils protègent réellement :
 * garde de rôle, organisation devant être suspendue, nom de confirmation exact. L'ordre de
 * suppression et le respect des clés étrangères relèvent, eux, de
 * `organisation-purge.integration.test.ts` (vraie Postgres) : un mock n'a pas de FK.
 */

const ORG = 'org-a'
const NOM = 'WAMBA TCHOUPA'

function buildMock(opts: { actif?: boolean; absente?: boolean; auditThrows?: boolean } = {}) {
  const supprimes: string[] = []
  const blobsSupprimes: string[] = []
  const platformAudits: any[] = []

  const modele = (nom: string) => ({
    findMany: async () =>
      nom === 'Utilisateur'
        ? [{ id: 'u1' }]
        : nom === 'Membre'
          ? [{ id: 'm1', photoBlobUrl: 'https://blob.test/photo', photoMime: 'image/png' }]
          : [],
    // Résolution de l'`acteurEmail` par le journal d'audit (seul `Utilisateur` est interrogé) — via
    // le Proxy, pour NE PAS shadow `findMany`/`deleteMany` en ajoutant une entrée explicite.
    findUnique: async () => (nom === 'Utilisateur' ? { email: 'super-admin@nkoni.test' } : null),
    deleteMany: async () => {
      supprimes.push(nom)
      return { count: 1 }
    },
    count: async () => 0,
  })

  const prisma: any = new Proxy(
    {
      organisation: {
        findUnique: async () =>
          opts.absente ? null : { id: ORG, nom: NOM, actif: opts.actif ?? false, forfait: 'GRATUIT' },
        delete: async () => {
          supprimes.push('Organisation')
          return { id: ORG }
        },
        findMany: async () => [],
      },
      refreshToken: {
        deleteMany: async () => {
          supprimes.push('RefreshToken')
          return { count: 1 }
        },
      },
      // Journal d'audit PLATEFORME : la purge journalise FAIL-CLOSED avant la transaction.
      // (`utilisateur` reste géré par le Proxy → conserve findMany/deleteMany.)
      platformAuditLog: {
        create: async (args: any) => {
          if (opts.auditThrows) throw new Error('audit indisponible')
          platformAudits.push(args.data)
          return { id: 'pa-1' }
        },
      },
      $transaction: async (fn: any) => fn(prisma),
    },
    {
      get(cible: any, prop: string) {
        if (prop in cible) return cible[prop]
        return modele(prop.charAt(0).toUpperCase() + prop.slice(1))
      },
    },
  )

  const blob = {
    put: async () => ({ url: '' }),
    del: async (url: string) => {
      blobsSupprimes.push(url)
    },
    lireContenu: async () => null,
  }

  return { prisma, blob, supprimes, blobsSupprimes, platformAudits }
}

const superAdmin = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'sa-1', role: 'SUPER_ADMIN' })}`,
})
const adminTenant = (app: FastifyInstance) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u-1', role: 'ADMIN', organisationId: ORG })}`,
})

async function appAvec(mock: ReturnType<typeof buildMock>): Promise<FastifyInstance> {
  const app = await buildApp({ prisma: mock.prisma, blob: mock.blob as any, logger: false })
  await app.ready()
  return app
}

describe('DELETE /platform/organisations/:id — verrous', () => {
  let app: FastifyInstance
  let mock: ReturnType<typeof buildMock>

  afterEach(async () => {
    await app.close()
  })

  it('refusé à un ADMIN de tenant → 403 (opération de plateforme)', async () => {
    mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: adminTenant(app),
      payload: { confirmationNom: NOM },
    })
    expect(res.statusCode).toBe(403)
    expect(mock.supprimes).toHaveLength(0)
  })

  it('sans token → 401', async () => {
    mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      payload: { confirmationNom: NOM },
    })
    expect(res.statusCode).toBe(401)
  })

  it('organisation ENCORE ACTIVE → 409, rien n’est supprimé', async () => {
    mock = buildMock({ actif: true })
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: superAdmin(app),
      payload: { confirmationNom: NOM },
    })
    expect(res.statusCode).toBe(409)
    expect(mock.supprimes).toHaveLength(0)
  })

  it('nom de confirmation ERRONÉ → 400, rien n’est supprimé', async () => {
    mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: superAdmin(app),
      payload: { confirmationNom: 'Wamba Tchoupa' }, // casse différente : refusé
    })
    expect(res.statusCode).toBe(400)
    expect(mock.supprimes).toHaveLength(0)
  })

  it('confirmation ABSENTE → 400 (schéma), rien n’est supprimé', async () => {
    mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: superAdmin(app),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(mock.supprimes).toHaveLength(0)
  })

  it('organisation inconnue → 404', async () => {
    mock = buildMock({ absente: true })
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: '/platform/organisations/inconnue',
      headers: superAdmin(app),
      payload: { confirmationNom: NOM },
    })
    expect(res.statusCode).toBe(404)
  })

  it('verrous satisfaits → 200, purge dans l’ordre, blobs supprimés APRÈS, export renvoyé', async () => {
    mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: superAdmin(app),
      payload: { confirmationNom: NOM },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.supprimee).toBe(true)
    // L'ordre effectif suit la constante.
    expect(mock.supprimes).toEqual([...ORDRE_SUPPRESSION])
    // Le blob de la photo (issu du manifeste de l'export) a bien été purgé.
    expect(mock.blobsSupprimes).toEqual(['https://blob.test/photo'])
    expect(body.blobs.supprimes).toBe(1)
    // L'export est renvoyé dans la réponse : c'est la dernière occasion de le récupérer.
    expect(body.export.version).toBe(1)
    expect(body.export.fichiers).toHaveLength(1)
    // TRACE PLATEFORME écrite AVANT la purge, avec snapshot de l'org (nom/forfait/actif).
    expect(mock.platformAudits).toHaveLength(1)
    expect(mock.platformAudits[0]).toMatchObject({
      action: 'PURGER',
      organisationCibleId: ORG,
      organisationNom: NOM,
      donneesAvant: { nom: NOM, forfait: 'GRATUIT', actif: false },
    })
  })

  it('FAIL-CLOSED : si l’écriture du journal échoue → 503, RIEN n’est purgé', async () => {
    mock = buildMock({ auditThrows: true })
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'DELETE',
      url: `/platform/organisations/${ORG}`,
      headers: superAdmin(app),
      payload: { confirmationNom: NOM },
    })

    expect(res.statusCode).toBe(503)
    // Pas de trace ⇒ pas de destruction : aucune suppression, aucun blob touché.
    expect(mock.supprimes).toHaveLength(0)
    expect(mock.blobsSupprimes).toHaveLength(0)
    expect(mock.platformAudits).toHaveLength(0)
  })
})

describe('GET /platform/organisations/:id/export', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  it('renvoie l’export en pièce jointe, SANS rien supprimer (idempotent)', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'GET',
      url: `/platform/organisations/${ORG}/export`,
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.json().version).toBe(1)
    expect(mock.supprimes).toHaveLength(0)
    expect(mock.blobsSupprimes).toHaveLength(0)
  })

  it('refusé à un ADMIN de tenant → 403', async () => {
    const mock = buildMock()
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'GET',
      url: `/platform/organisations/${ORG}/export`,
      headers: adminTenant(app),
    })
    expect(res.statusCode).toBe(403)
  })

  it('organisation inconnue → 404', async () => {
    const mock = buildMock({ absente: true })
    app = await appAvec(mock)
    const res = await app.inject({
      method: 'GET',
      url: '/platform/organisations/inconnue/export',
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(404)
  })
})
