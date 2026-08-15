import { describe, it, expect } from 'vitest'
import {
  vraiPushClient,
  enregistrerAbonnementPush,
  supprimerAbonnementPush,
  abonnementsDe,
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
