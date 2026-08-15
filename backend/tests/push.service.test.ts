import { describe, it, expect } from 'vitest'
import {
  vraiPushClient,
  enregistrerAbonnementPush,
  supprimerAbonnementPush,
  abonnementsDe,
  notifierParPush,
  type PushClient,
  type PushPrisma,
} from '../src/services/push.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockPrisma() {
  const calls: { deleteMany: any[]; create: any[] } = { deleteMany: [], create: [] }
  const prisma: PushPrisma = {
    pushSubscription: {
      deleteMany: async (a: any) => {
        calls.deleteMany.push(a)
        return { count: 1 }
      },
      create: async (a: any) => {
        calls.create.push(a)
        return {}
      },
      findMany: async () => [{ endpoint: 'e1', p256dh: 'p1', auth: 'a1' }],
    },
  }
  return { prisma, calls }
}

describe('vraiPushClient — no-op sans clés VAPID', () => {
  it('disponible=false et envoyer renvoie {ok:false} quand les clés manquent', async () => {
    const sauve = {
      pub: process.env['VAPID_PUBLIC_KEY'],
      priv: process.env['VAPID_PRIVATE_KEY'],
      sub: process.env['VAPID_SUBJECT'],
    }
    delete process.env['VAPID_PUBLIC_KEY']
    delete process.env['VAPID_PRIVATE_KEY']
    delete process.env['VAPID_SUBJECT']
    try {
      expect(vraiPushClient.disponible()).toBe(false)
      const r = await vraiPushClient.envoyer(
        { endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } },
        { titre: 'T', message: 'M' },
      )
      expect(r).toEqual({ ok: false })
    } finally {
      if (sauve.pub) process.env['VAPID_PUBLIC_KEY'] = sauve.pub
      if (sauve.priv) process.env['VAPID_PRIVATE_KEY'] = sauve.priv
      if (sauve.sub) process.env['VAPID_SUBJECT'] = sauve.sub
    }
  })
})

describe('persistance des abonnements push', () => {
  it('enregistrer = supprime l’endpoint puis (re)crée avec les bonnes clés (idempotent)', async () => {
    const { prisma, calls } = mockPrisma()
    await enregistrerAbonnementPush(prisma, 'u-1', {
      endpoint: 'https://push/e',
      keys: { p256dh: 'PP', auth: 'AA' },
    })
    expect(calls.deleteMany[0]).toEqual({ where: { endpoint: 'https://push/e' } })
    expect(calls.create[0]).toEqual({
      data: { destinataireId: 'u-1', endpoint: 'https://push/e', p256dh: 'PP', auth: 'AA' },
    })
  })

  it('supprimer = deleteMany par endpoint', async () => {
    const { prisma, calls } = mockPrisma()
    await supprimerAbonnementPush(prisma, 'https://push/e')
    expect(calls.deleteMany[0]).toEqual({ where: { endpoint: 'https://push/e' } })
  })

  it('abonnementsDe mappe les lignes en forme PushSubscription', async () => {
    const { prisma } = mockPrisma()
    const abos = await abonnementsDe(prisma, 'u-1')
    expect(abos).toEqual([{ endpoint: 'e1', keys: { p256dh: 'p1', auth: 'a1' } }])
  })
})

function mockPush(
  opts: { disponible?: boolean; expire?: string[]; erreur?: Record<string, unknown> } = {},
) {
  const envois: { endpoint: string; payload: unknown }[] = []
  const push: PushClient = {
    disponible: () => opts.disponible ?? true,
    envoyer: async (sub, payload) => {
      envois.push({ endpoint: sub.endpoint, payload })
      if (opts.erreur && sub.endpoint in opts.erreur) {
        return { ok: false, erreur: opts.erreur[sub.endpoint] }
      }
      return { ok: true, expire: (opts.expire ?? []).includes(sub.endpoint) }
    },
  }
  return { push, envois }
}

/** Espion d'observabilité minimal (surface `PushObservabilite`). */
function mockObservabilite() {
  const appels: { erreur: unknown; contexte: Record<string, unknown> }[] = []
  return {
    obs: { signaler: (erreur: unknown, contexte: any) => appels.push({ erreur, contexte }) },
    appels,
  }
}

describe('notifierParPush — best-effort', () => {
  it('no-op si le client push est indisponible (aucun envoi)', async () => {
    const { prisma } = mockPrisma()
    const { push, envois } = mockPush({ disponible: false })
    await notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M' })
    expect(envois).toHaveLength(0)
  })

  it('envoie le payload à chaque abonnement du destinataire', async () => {
    const { prisma } = mockPrisma() // findMany → 1 abo (e1)
    const { push, envois } = mockPush()
    await notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M', url: '/notifications' })
    expect(envois).toEqual([{ endpoint: 'e1', payload: { titre: 'T', message: 'M', url: '/notifications' } }])
  })

  it('purge un abonnement expiré (envoyer → expire:true)', async () => {
    const { prisma, calls } = mockPrisma()
    const { push } = mockPush({ expire: ['e1'] })
    await notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M' })
    expect(calls.deleteMany).toContainEqual({ where: { endpoint: 'e1' } })
  })

  it('ne lève JAMAIS (une erreur de lecture est avalée)', async () => {
    const prisma: PushPrisma = {
      pushSubscription: {
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({}),
        findMany: async () => {
          throw new Error('DB down')
        },
      },
    }
    const { push } = mockPush()
    await expect(
      notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M' }),
    ).resolves.toBeUndefined()
  })

  it('SIGNALE à l’observabilité une erreur d’envoi INATTENDUE (config VAPID, réseau)', async () => {
    const { prisma } = mockPrisma() // findMany → 1 abo (e1)
    const bug = new Error('Vapid subject is not a url or mailto url')
    const { push } = mockPush({ erreur: { e1: bug } })
    const { obs, appels } = mockObservabilite()
    await notifierParPush(prisma, push, 'u-9', { titre: 'T', message: 'M' }, obs)
    expect(appels).toHaveLength(1)
    expect(appels[0]?.erreur).toBe(bug)
    expect(appels[0]?.contexte).toEqual({ source: 'push', destinataireId: 'u-9' })
  })

  it('ne signale PAS un abonnement expiré (404/410 = cas normal, purge silencieuse)', async () => {
    const { prisma, calls } = mockPrisma()
    const { push } = mockPush({ expire: ['e1'] })
    const { obs, appels } = mockObservabilite()
    await notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M' }, obs)
    expect(calls.deleteMany).toContainEqual({ where: { endpoint: 'e1' } })
    expect(appels).toHaveLength(0)
  })

  it('signale aussi une erreur de LECTURE quand l’observabilité est fournie (best-effort préservé)', async () => {
    const prisma: PushPrisma = {
      pushSubscription: {
        deleteMany: async () => ({ count: 0 }),
        create: async () => ({}),
        findMany: async () => {
          throw new Error('DB down')
        },
      },
    }
    const { push } = mockPush()
    const { obs, appels } = mockObservabilite()
    await expect(
      notifierParPush(prisma, push, 'u-1', { titre: 'T', message: 'M' }, obs),
    ).resolves.toBeUndefined()
    expect(appels).toHaveLength(1)
    expect(appels[0]?.contexte).toEqual({ source: 'push', destinataireId: 'u-1' })
  })
})
