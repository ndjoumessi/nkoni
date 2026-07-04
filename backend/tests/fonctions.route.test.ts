import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildFonctionsMock } from './support/fonctions-prisma-mock'

/**
 * V1.1 — Fonctions/organes (CRUD). Prisma mocké (en mémoire).
 * Couvre : CRUD, unicité du nom (409), permissions par rôle, 404.
 */

describe('Fonctions (§5)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildFonctionsMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const creer = (payload: object, role = 'PRESIDENT') =>
    app.inject({ method: 'POST', url: '/fonctions', headers: auth(role), payload })

  /* CRUD -------------------------------------------------------------------- */

  it('crée une fonction (201)', async () => {
    const res = await creer({ nom: 'Président', description: 'Chef de la famille' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ nom: 'Président', description: 'Chef de la famille' })
  })

  it('liste les fonctions (200) avec titulaire actuel et décompte', async () => {
    await creer({ nom: 'Trésorier' })
    const res = await app.inject({ method: 'GET', url: '/fonctions', headers: auth('MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ nom: 'Trésorier' })
    expect(list[0].affectations).toEqual([]) // aucun titulaire encore
    expect(list[0]._count).toMatchObject({ affectations: 0 })
  })

  it('récupère le détail d’une fonction avec son historique (200)', async () => {
    const id = (await creer({ nom: 'Secrétaire' })).json().id
    const res = await app.inject({ method: 'GET', url: `/fonctions/${id}`, headers: auth('TRESORIERE') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id, nom: 'Secrétaire' })
    expect(res.json().affectations).toEqual([])
  })

  it('met à jour une fonction (200)', async () => {
    const id = (await creer({ nom: 'Commissaire' })).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/fonctions/${id}`,
      headers: auth('SECRETAIRE'),
      payload: { description: 'Contrôle des comptes' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ nom: 'Commissaire', description: 'Contrôle des comptes' })
  })

  it('supprime une fonction (204) puis 404', async () => {
    const id = (await creer({ nom: 'Guide' })).json().id
    const del = await app.inject({ method: 'DELETE', url: `/fonctions/${id}`, headers: auth('ADMIN') })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: `/fonctions/${id}`, headers: auth('ADMIN') })
    expect(after.statusCode).toBe(404)
  })

  it('refuse un nom en double (409)', async () => {
    await creer({ nom: 'Président' })
    const dup = await creer({ nom: 'Président' })
    expect(dup.statusCode).toBe(409)
  })

  it('404 sur une fonction inconnue', async () => {
    const res = await app.inject({ method: 'GET', url: '/fonctions/inexistant', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(404)
  })

  /* Permissions ------------------------------------------------------------- */

  it('SECRETAIRE peut créer (201) mais PAS supprimer (403)', async () => {
    const cree = await creer({ nom: 'Vice-président' }, 'SECRETAIRE')
    expect(cree.statusCode).toBe(201)
    const del = await app.inject({
      method: 'DELETE',
      url: `/fonctions/${cree.json().id}`,
      headers: auth('SECRETAIRE'),
    })
    expect(del.statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE lit (200) mais ne crée pas (403)', async () => {
    const list = await app.inject({ method: 'GET', url: '/fonctions', headers: auth('MEMBRE_SIMPLE') })
    expect(list.statusCode).toBe(200)
    const create = await creer({ nom: 'X' }, 'MEMBRE_SIMPLE')
    expect(create.statusCode).toBe(403)
  })

  it('GUIDE_RELIGIEUX : aucun droit (403 en lecture)', async () => {
    const res = await app.inject({ method: 'GET', url: '/fonctions', headers: auth('GUIDE_RELIGIEUX') })
    expect(res.statusCode).toBe(403)
  })
})
