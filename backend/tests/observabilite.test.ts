import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../src/app'
import { intercepterAudit } from '../src/lib/audit-middleware'
import { orgContext } from '../src/lib/org-context'
import { observabiliteNoop, vraiObservabiliteClient } from '../src/lib/observabilite'
import type { ObservabiliteClient, ContexteErreur } from '../src/lib/observabilite'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OBSERVABILITÉ (bloquant GA 0.1) — on ASSERTE que les trois points aveugles signalent.
 *
 * C'est la raison d'être de la couche `ObservabiliteClient` : un `Sentry.captureException` appelé
 * statiquement dans le code ne serait pas vérifiable sans réseau ni DSN. Ici on injecte un
 * espion et on prouve que l'incident remonte — et, tout aussi important, qu'il ne remonte PAS
 * quand il ne doit pas (une 4xx métier n'est pas un incident).
 */

/** Espion : enregistre les signalements au lieu de les envoyer. */
function espion(): ObservabiliteClient & { appels: Array<{ erreur: unknown; contexte: ContexteErreur }> } {
  const appels: Array<{ erreur: unknown; contexte: ContexteErreur }> = []
  return {
    appels,
    disponible: () => true,
    signaler: (erreur, contexte) => {
      appels.push({ erreur, contexte })
    },
  }
}

describe('client réel — inerte sans SENTRY_DSN', () => {
  const dsnInitial = process.env['SENTRY_DSN']
  afterEach(() => {
    if (dsnInitial === undefined) delete process.env['SENTRY_DSN']
    else process.env['SENTRY_DSN'] = dsnInitial
  })

  it('disponible() = false sans DSN', () => {
    delete process.env['SENTRY_DSN']
    expect(vraiObservabiliteClient.disponible()).toBe(false)
  })

  it('signaler() ne lève pas sans DSN (no-op silencieux)', () => {
    delete process.env['SENTRY_DSN']
    expect(() => vraiObservabiliteClient.signaler(new Error('x'), { source: 'test' })).not.toThrow()
  })

  it('le no-op explicite ne lève pas non plus', () => {
    expect(() => observabiliteNoop.signaler(new Error('x'), { source: 'test' })).not.toThrow()
  })
})

describe('erreurs HTTP — seules les 5xx sont des incidents', () => {
  it('une 500 est signalée avec sa route (motif, pas l’URL réelle)', async () => {
    const obs = espion()
    const app = await buildApp({ observabilite: obs, logger: false, prisma: {} as any })
    app.get('/boum', async () => {
      throw new Error('panne interne')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/boum' })
    expect(res.statusCode).toBe(500)

    expect(obs.appels).toHaveLength(1)
    expect(obs.appels[0]?.contexte).toMatchObject({ source: 'http', methode: 'GET', statut: 500 })
    await app.close()
  })

  it('une 4xx (404 route inconnue) n’est PAS signalée — sinon le bruit noierait les vrais incidents', async () => {
    const obs = espion()
    const app = await buildApp({ observabilite: obs, logger: false, prisma: {} as any })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/route-inexistante' })
    expect(res.statusCode).toBe(404)
    expect(obs.appels).toHaveLength(0)
    await app.close()
  })

  it('le corps rendu au client reste générique (aucune fuite du message interne)', async () => {
    const obs = espion()
    const app = await buildApp({ observabilite: obs, logger: false, prisma: {} as any })
    app.get('/fuite', async () => {
      throw new Error('SELECT * FROM "Utilisateur" -- détail interne')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/fuite' })
    expect(res.json().message).not.toContain('Utilisateur')
    await app.close()
  })
})

describe('échec d’écriture d’audit — une opération métier non tracée est un incident', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signale quand le journal échoue, SANS faire échouer l’opération métier', async () => {
    const obs = espion()
    const base: any = {
      membre: { findUnique: () => ({ catch: async () => null }) },
      // L'écriture du journal échoue…
      auditLog: { create: async () => { throw new Error('journal indisponible') } },
    }

    const resultat = await orgContext.run({ organisationId: 'org-1' }, () =>
      intercepterAudit(
        base,
        {
          model: 'Membre',
          operation: 'create',
          args: { data: { nom: 'Djoumessi' } },
          query: async () => ({ id: 'm1', nom: 'Djoumessi' }),
        },
        obs,
      ),
    )

    // …l'opération métier réussit quand même (best-effort de l'audit préservé).
    expect(resultat).toMatchObject({ id: 'm1' })
    // …et l'incident est remonté, avec de quoi le situer.
    expect(obs.appels).toHaveLength(1)
    expect(obs.appels[0]?.contexte).toMatchObject({
      source: 'audit',
      modele: 'Membre',
      operation: 'create',
      organisationId: 'org-1',
    })
  })

  it('ne signale RIEN quand le journal s’écrit normalement', async () => {
    const obs = espion()
    const base: any = {
      membre: { findUnique: () => ({ catch: async () => null }) },
      auditLog: { create: async () => ({ id: 'a1' }) },
    }

    await orgContext.run({ organisationId: 'org-1' }, () =>
      intercepterAudit(
        base,
        {
          model: 'Membre',
          operation: 'create',
          args: { data: {} },
          query: async () => ({ id: 'm1' }),
        },
        obs,
      ),
    )
    expect(obs.appels).toHaveLength(0)
  })
})
