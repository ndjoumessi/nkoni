import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildReunionsMock } from './support/reunions-prisma-mock'

/**
 * V1.1 — Réunions + Ordre du jour. Prisma mocké (en mémoire).
 * Couvre : CRUD, permissions par rôle, points imbriqués, réordonnancement (valide/invalide),
 * cas 404.
 */

describe('Réunions (§5)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildReunionsMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const creer = (payload: object, role = 'PRESIDENT') =>
    app.inject({ method: 'POST', url: '/reunions', headers: auth(role), payload })

  const reunionBase = { date: '2026-09-01T10:00:00.000Z', lieu: 'Yaoundé' }

  /* CRUD -------------------------------------------------------------------- */

  it('crée une réunion avec ses points d’ordre du jour (201, points ordonnés)', async () => {
    const res = await creer({
      ...reunionBase,
      type: 'EXTRAORDINAIRE',
      pointsOrdreDuJour: [{ titre: 'Point A' }, { titre: 'Point B', notes: 'note' }],
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ lieu: 'Yaoundé', type: 'EXTRAORDINAIRE', statut: 'PLANIFIEE' })
    expect(body.pointsOrdreDuJour).toHaveLength(2)
    expect(body.pointsOrdreDuJour.map((p: { ordre: number }) => p.ordre)).toEqual([0, 1])
    expect(body.pointsOrdreDuJour[0].titre).toBe('Point A')
  })

  it('liste les réunions (200) avec un décompte', async () => {
    await creer({ ...reunionBase, pointsOrdreDuJour: [{ titre: 'X' }] })
    const res = await app.inject({ method: 'GET', url: '/reunions', headers: auth('MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0]._count).toMatchObject({ pointsOrdreDuJour: 1 })
  })

  it('récupère le détail d’une réunion (200)', async () => {
    const id = (await creer(reunionBase)).json().id
    const res = await app.inject({ method: 'GET', url: `/reunions/${id}`, headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(id)
  })

  it('met à jour une réunion (200) — statut TENUE + compte-rendu', async () => {
    const id = (await creer(reunionBase)).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/reunions/${id}`,
      headers: auth('SECRETAIRE'),
      payload: { statut: 'TENUE', compteRenduTexte: 'Séance tenue.' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ statut: 'TENUE', compteRenduTexte: 'Séance tenue.' })
  })

  it('supprime une réunion (204)', async () => {
    const id = (await creer(reunionBase)).json().id
    const res = await app.inject({ method: 'DELETE', url: `/reunions/${id}`, headers: auth('ADMIN') })
    expect(res.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: `/reunions/${id}`, headers: auth('ADMIN') })
    expect(after.statusCode).toBe(404)
  })

  /* Permissions ------------------------------------------------------------- */

  it('SECRETAIRE peut créer (201) mais PAS supprimer (403)', async () => {
    const cree = await creer(reunionBase, 'SECRETAIRE')
    expect(cree.statusCode).toBe(201)
    const del = await app.inject({
      method: 'DELETE',
      url: `/reunions/${cree.json().id}`,
      headers: auth('SECRETAIRE'),
    })
    expect(del.statusCode).toBe(403)
  })

  it('TRESORIERE est en lecture seule : création refusée (403)', async () => {
    const res = await creer(reunionBase, 'TRESORIERE')
    expect(res.statusCode).toBe(403)
  })

  it('GUIDE_RELIGIEUX n’a aucun droit : lecture refusée (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/reunions', headers: auth('GUIDE_RELIGIEUX') })
    expect(res.statusCode).toBe(403)
  })

  it('sans token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/reunions' })
    expect(res.statusCode).toBe(401)
  })

  /* Points d’ordre du jour -------------------------------------------------- */

  it('ajoute un point en fin d’ordre du jour (201, ordre = 2)', async () => {
    const id = (await creer({ ...reunionBase, pointsOrdreDuJour: [{ titre: 'A' }, { titre: 'B' }] })).json().id
    const res = await app.inject({
      method: 'POST',
      url: `/reunions/${id}/points`,
      headers: auth('SECRETAIRE'),
      payload: { titre: 'C' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ titre: 'C', ordre: 2 })
  })

  it('réordonne les points (200, nouvel ordre appliqué)', async () => {
    const reunion = (
      await creer({ ...reunionBase, pointsOrdreDuJour: [{ titre: 'A' }, { titre: 'B' }, { titre: 'C' }] })
    ).json()
    const ids = reunion.pointsOrdreDuJour.map((p: { id: string }) => p.id)
    const reversed = [...ids].reverse()
    const res = await app.inject({
      method: 'PUT',
      url: `/reunions/${reunion.id}/points/ordre`,
      headers: auth('PRESIDENT'),
      payload: { ordreIds: reversed },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().pointsOrdreDuJour.map((p: { id: string }) => p.id)).toEqual(reversed)
  })

  it('réordonnancement avec un id étranger → 400', async () => {
    const reunion = (await creer({ ...reunionBase, pointsOrdreDuJour: [{ titre: 'A' }, { titre: 'B' }] })).json()
    const ids = reunion.pointsOrdreDuJour.map((p: { id: string }) => p.id)
    const res = await app.inject({
      method: 'PUT',
      url: `/reunions/${reunion.id}/points/ordre`,
      headers: auth('PRESIDENT'),
      payload: { ordreIds: [ids[0], 'pt-inconnu'] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('réordonnancement incomplet (sous-ensemble) → 400', async () => {
    const reunion = (await creer({ ...reunionBase, pointsOrdreDuJour: [{ titre: 'A' }, { titre: 'B' }] })).json()
    const ids = reunion.pointsOrdreDuJour.map((p: { id: string }) => p.id)
    const res = await app.inject({
      method: 'PUT',
      url: `/reunions/${reunion.id}/points/ordre`,
      headers: auth('PRESIDENT'),
      payload: { ordreIds: [ids[0]] },
    })
    expect(res.statusCode).toBe(400)
  })

  /* Cas 404 ----------------------------------------------------------------- */

  it('détail d’une réunion inconnue → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/reunions/nope', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(404)
  })

  it('mise à jour d’un point inconnu → 404', async () => {
    const id = (await creer(reunionBase)).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/reunions/${id}/points/nope`,
      headers: auth('ADMIN'),
      payload: { titre: 'X' },
    })
    expect(res.statusCode).toBe(404)
  })
})
