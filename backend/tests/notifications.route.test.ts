import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildNotificationsMock, type StoredNotif } from './support/notifications-prisma-mock'

/**
 * Routes Notifications (§5) — isolation STRICTE par utilisateur : chacun ne voit / modifie
 * que les siennes, aucune fuite entre comptes. Auth via JWT (sub = id Utilisateur).
 */

function mkNotif(id: string, destinataireId: string, lu: boolean, date: string): StoredNotif {
  return {
    id,
    destinataireId,
    type: 'VERSEMENT_RECU',
    titre: 'T',
    message: 'M',
    entiteType: null,
    entiteId: null,
    lu,
    dateCreation: new Date(date),
    dateLecture: null,
  }
}

describe('Routes Notifications (§5)', () => {
  let app: FastifyInstance
  let notifs: Map<string, StoredNotif>

  beforeEach(async () => {
    const mock = buildNotificationsMock({
      notifs: [
        mkNotif('a1', 'u-a', false, '2026-06-01'),
        mkNotif('a2', 'u-a', true, '2026-06-02'),
        mkNotif('b1', 'u-b', false, '2026-06-03'),
      ],
    })
    notifs = mock.notifs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: mock.prisma as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  // sub = id Utilisateur ; le rôle n'intervient pas (autorisation par propriété).
  const auth = (sub: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role: 'MEMBRE_SIMPLE' })}`,
  })

  it('GET /notifications ne renvoie QUE les siennes', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications', headers: auth('u-a') })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((n: { id: string }) => n.id)
    expect(ids).toEqual(['a2', 'a1']) // récentes d'abord, aucune de u-b
  })

  it('GET /notifications/compteur = nombre de SES non-lues', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notifications/compteur',
      headers: auth('u-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ nonLues: 1 })
  })

  it('PATCH /notifications/:id/lu marque la sienne (204) et met à jour lu', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/a1/lu',
      headers: auth('u-a'),
    })
    expect(res.statusCode).toBe(204)
    expect(notifs.get('a1')?.lu).toBe(true)
  })

  it('PATCH /notifications/:id/lu REFUSE la notif d’un autre compte (404, pas de fuite)', async () => {
    // u-a tente de marquer b1 (appartenant à u-b).
    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/b1/lu',
      headers: auth('u-a'),
    })
    expect(res.statusCode).toBe(404)
    expect(notifs.get('b1')?.lu).toBe(false) // inchangée
  })

  it('PATCH /notifications/tout-lu ne marque que ses non-lues', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/tout-lu',
      headers: auth('u-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ count: 1 })
    expect(notifs.get('b1')?.lu).toBe(false) // celle de u-b intacte
  })

  it('sans authentification → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications' })
    expect(res.statusCode).toBe(401)
  })
})
