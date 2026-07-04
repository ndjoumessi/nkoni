import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildReunionsMock } from './support/reunions-prisma-mock'

/**
 * V1.1 — Résolutions (documentaires). Prisma mocké (en mémoire).
 * Couvre : CRUD, rattachement à un point d'ordre du jour, rejet d'un point d'une AUTRE
 * réunion (400), permissions par rôle, cas 404.
 */

describe('Résolutions (§5)', () => {
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

  // Crée une réunion (avec points optionnels) et renvoie l'objet créé.
  const creerReunion = async (points: object[] = [], role = 'PRESIDENT') => {
    const res = await app.inject({
      method: 'POST',
      url: '/reunions',
      headers: auth(role),
      payload: { date: '2026-09-01T10:00:00.000Z', lieu: 'Douala', pointsOrdreDuJour: points },
    })
    return res.json()
  }

  const creerResolution = (reunionId: string, payload: object, role = 'SECRETAIRE') =>
    app.inject({
      method: 'POST',
      url: `/reunions/${reunionId}/resolutions`,
      headers: auth(role),
      payload,
    })

  /* CRUD -------------------------------------------------------------------- */

  it('crée une résolution simple (201, statut par défaut ADOPTEE)', async () => {
    const reunion = await creerReunion()
    const res = await creerResolution(reunion.id, { texte: 'Adopter le budget.' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ texte: 'Adopter le budget.', statut: 'ADOPTEE', reunionId: reunion.id })
  })

  it('crée une résolution liée à un point de la même réunion (201)', async () => {
    const reunion = await creerReunion([{ titre: 'Budget' }])
    const pointId = reunion.pointsOrdreDuJour[0].id
    const res = await creerResolution(reunion.id, {
      texte: 'Résolution sur le budget.',
      statut: 'REPORTEE',
      pointOrdreDuJourId: pointId,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ statut: 'REPORTEE', pointOrdreDuJourId: pointId })
  })

  it('liste les résolutions d’une réunion (200)', async () => {
    const reunion = await creerReunion()
    await creerResolution(reunion.id, { texte: 'R1' })
    await creerResolution(reunion.id, { texte: 'R2' })
    const res = await app.inject({
      method: 'GET',
      url: `/reunions/${reunion.id}/resolutions`,
      headers: auth('MEMBRE_SIMPLE'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(2)
  })

  it('met à jour une résolution (200) — statut REJETEE', async () => {
    const reunion = await creerReunion()
    const id = (await creerResolution(reunion.id, { texte: 'R' })).json().id
    const res = await app.inject({
      method: 'PATCH',
      url: `/resolutions/${id}`,
      headers: auth('PRESIDENT'),
      payload: { statut: 'REJETEE' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().statut).toBe('REJETEE')
  })

  it('supprime une résolution (204, ADMIN)', async () => {
    const reunion = await creerReunion()
    const id = (await creerResolution(reunion.id, { texte: 'R' })).json().id
    const res = await app.inject({ method: 'DELETE', url: `/resolutions/${id}`, headers: auth('ADMIN') })
    expect(res.statusCode).toBe(204)
  })

  /* Intégrité référentielle ------------------------------------------------- */

  it('résolution liée à un point d’une AUTRE réunion → 400', async () => {
    const reunionA = await creerReunion([{ titre: 'Point A' }])
    const reunionB = await creerReunion([{ titre: 'Point B' }])
    const pointDeB = reunionB.pointsOrdreDuJour[0].id
    // On tente de créer une résolution sous la réunion A en référençant un point de B.
    const res = await creerResolution(reunionA.id, {
      texte: 'Incohérente',
      pointOrdreDuJourId: pointDeB,
    })
    expect(res.statusCode).toBe(400)
  })

  it('résolution liée à un point inexistant → 404', async () => {
    const reunion = await creerReunion()
    const res = await creerResolution(reunion.id, { texte: 'X', pointOrdreDuJourId: 'pt-inconnu' })
    expect(res.statusCode).toBe(404)
  })

  it('création sous une réunion inconnue → 404', async () => {
    const res = await creerResolution('reu-inconnue', { texte: 'X' })
    expect(res.statusCode).toBe(404)
  })

  /* Permissions ------------------------------------------------------------- */

  it('SECRETAIRE crée (201) mais ne peut PAS supprimer (403)', async () => {
    const reunion = await creerReunion()
    const created = await creerResolution(reunion.id, { texte: 'R' }, 'SECRETAIRE')
    expect(created.statusCode).toBe(201)
    const del = await app.inject({
      method: 'DELETE',
      url: `/resolutions/${created.json().id}`,
      headers: auth('SECRETAIRE'),
    })
    expect(del.statusCode).toBe(403)
  })

  it('COMMISSAIRE_COMPTES est en lecture seule : création refusée (403)', async () => {
    const reunion = await creerReunion()
    const res = await creerResolution(reunion.id, { texte: 'R' }, 'COMMISSAIRE_COMPTES')
    expect(res.statusCode).toBe(403)
  })

  it('sans token → 401', async () => {
    const reunion = await creerReunion()
    const res = await app.inject({
      method: 'GET',
      url: `/reunions/${reunion.id}/resolutions`,
    })
    expect(res.statusCode).toBe(401)
  })

  /* 404 --------------------------------------------------------------------- */

  it('mise à jour d’une résolution inconnue → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/resolutions/nope',
      headers: auth('ADMIN'),
      payload: { statut: 'ADOPTEE' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('suppression d’une résolution inconnue → 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/resolutions/nope', headers: auth('ADMIN') })
    expect(res.statusCode).toBe(404)
  })
})
