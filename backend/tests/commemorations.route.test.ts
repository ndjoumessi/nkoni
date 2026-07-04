import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildCommemorationsMock } from './support/commemorations-prisma-mock'

/**
 * V2 — Commémorations / cérémonies. Prisma mocké.
 * Couvre : CRUD, permissions par rôle (GUIDE_RELIGIEUX = domaine : CRUD ; bureau
 * create/update sans delete ; autres lecture), membres concernés, validations, 404.
 */

describe('Commémorations (V2)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildCommemorationsMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const creer = (payload: object, role = 'GUIDE_RELIGIEUX') =>
    app.inject({ method: 'POST', url: '/commemorations', headers: auth(role), payload })

  const base = { titre: 'Hommage aux anciens', date: '2026-11-01T10:00:00.000Z' }

  /* CRUD -------------------------------------------------------------------- */

  it('crée une commémoration avec membres concernés (201)', async () => {
    const res = await creer({
      ...base,
      type: 'COMMEMORATION',
      lieu: 'Village',
      membresConcernes: ['m-1', 'm-2'],
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ titre: 'Hommage aux anciens', type: 'COMMEMORATION', statut: 'PLANIFIEE' })
    expect(body.membresConcernes.map((m: { id: string }) => m.id).sort()).toEqual(['m-1', 'm-2'])
  })

  it('liste les commémorations (200)', async () => {
    await creer(base)
    const res = await app.inject({ method: 'GET', url: '/commemorations', headers: auth('MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('récupère le détail (200)', async () => {
    const id = (await creer(base)).json().id
    const res = await app.inject({ method: 'GET', url: `/commemorations/${id}`, headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(id)
  })

  it('met à jour type/statut/lieu + remplace les membres concernés (200)', async () => {
    const id = (await creer({ ...base, membresConcernes: ['m-1'] })).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/commemorations/${id}`,
      headers: auth('SECRETAIRE'),
      payload: { statut: 'TENUE', type: 'CEREMONIE', membresConcernes: ['m-2', 'm-3'] },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ statut: 'TENUE', type: 'CEREMONIE' })
    expect(body.membresConcernes.map((m: { id: string }) => m.id).sort()).toEqual(['m-2', 'm-3'])
  })

  it('supprime une commémoration (204) puis 404', async () => {
    const id = (await creer(base)).json().id
    const del = await app.inject({ method: 'DELETE', url: `/commemorations/${id}`, headers: auth('GUIDE_RELIGIEUX') })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: `/commemorations/${id}`, headers: auth('ADMIN') })
    expect(after.statusCode).toBe(404)
  })

  /* Validations ------------------------------------------------------------- */

  it('refuse un membre concerné inexistant (400)', async () => {
    const res = await creer({ ...base, membresConcernes: ['m-1', 'm-inconnu'] })
    expect(res.statusCode).toBe(400)
  })

  it('404 sur une commémoration inconnue', async () => {
    const res = await app.inject({ method: 'GET', url: '/commemorations/inconnue', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(404)
  })

  /* Permissions ------------------------------------------------------------- */

  it('GUIDE_RELIGIEUX a le CRUD complet (crée + supprime)', async () => {
    const cree = await creer(base, 'GUIDE_RELIGIEUX')
    expect(cree.statusCode).toBe(201)
    const del = await app.inject({
      method: 'DELETE',
      url: `/commemorations/${cree.json().id}`,
      headers: auth('GUIDE_RELIGIEUX'),
    })
    expect(del.statusCode).toBe(204)
  })

  it('PRESIDENT / SECRETAIRE créent (201) mais ne suppriment PAS (403)', async () => {
    for (const role of ['PRESIDENT', 'SECRETAIRE'] as const) {
      const cree = await creer(base, role)
      expect(cree.statusCode, role).toBe(201)
      const del = await app.inject({
        method: 'DELETE',
        url: `/commemorations/${cree.json().id}`,
        headers: auth(role),
      })
      expect(del.statusCode, role).toBe(403)
    }
  })

  it('TRESORIERE / COMMISSAIRE / MEMBRE_SIMPLE : lecture OK, création refusée (403)', async () => {
    const id = (await creer(base)).json().id
    for (const role of ['TRESORIERE', 'COMMISSAIRE_COMPTES', 'MEMBRE_SIMPLE'] as const) {
      const read = await app.inject({ method: 'GET', url: `/commemorations/${id}`, headers: auth(role) })
      expect(read.statusCode, role).toBe(200)
      const create = await creer(base, role)
      expect(create.statusCode, role).toBe(403)
    }
  })

  it('ADMIN a le CRUD complet (supprime)', async () => {
    const id = (await creer(base, 'ADMIN')).json().id
    const del = await app.inject({ method: 'DELETE', url: `/commemorations/${id}`, headers: auth('ADMIN') })
    expect(del.statusCode).toBe(204)
  })
})
