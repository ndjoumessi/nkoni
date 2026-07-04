import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildFonctionsMock } from './support/fonctions-prisma-mock'

/**
 * V1.1 — Affectations / historique des nominations. Prisma mocké (en mémoire).
 * Couvre : création, CLÔTURE AUTOMATIQUE (mono-titulaire), historique complet
 * consultable, membre cumulant plusieurs fonctions, permissions, 400/404.
 *
 * Membres pré-alimentés dans le mock : m-1, m-2, m-3.
 */

const D1 = '2024-01-01T00:00:00.000Z'
const D2 = '2025-06-01T00:00:00.000Z'
const D3 = '2026-03-01T00:00:00.000Z'

describe('Affectations (§5)', () => {
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

  const creerFonction = async (nom: string, role = 'PRESIDENT') => {
    const res = await app.inject({ method: 'POST', url: '/fonctions', headers: auth(role), payload: { nom } })
    return res.json().id as string
  }
  const affecter = (payload: object, role = 'PRESIDENT') =>
    app.inject({ method: 'POST', url: '/affectations', headers: auth(role), payload })
  const historique = (fonctionId: string, role = 'MEMBRE_SIMPLE') =>
    app.inject({ method: 'GET', url: `/fonctions/${fonctionId}/affectations`, headers: auth(role) })

  /* Création + clôture automatique ----------------------------------------- */

  it('nomme un titulaire sur une fonction libre (201, active)', async () => {
    const fonctionId = await creerFonction('Président')
    const res = await affecter({ fonctionId, membreId: 'm-1', dateDebut: D1 })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ fonctionId, membreId: 'm-1', dateFin: null })
    expect(body.membre).toMatchObject({ id: 'm-1' })
  })

  it('CLÔTURE AUTOMATIQUE : une 2e nomination clôture la précédente (dateFin = dateDebut de la nouvelle)', async () => {
    const fonctionId = await creerFonction('Trésorier')
    await affecter({ fonctionId, membreId: 'm-1', dateDebut: D1 })
    const seconde = await affecter({ fonctionId, membreId: 'm-2', dateDebut: D2 })
    expect(seconde.statusCode).toBe(201)
    expect(seconde.json()).toMatchObject({ membreId: 'm-2', dateFin: null })

    const histo = (await historique(fonctionId)).json()
    // Historique complet préservé (2 entrées), la plus récente d'abord.
    expect(histo).toHaveLength(2)
    const ancienne = histo.find((a: any) => a.membreId === 'm-1')
    const nouvelle = histo.find((a: any) => a.membreId === 'm-2')
    // L'ancienne est clôturée à la date de début de la nouvelle ; la nouvelle est active.
    expect(ancienne.dateFin).toBe(D2)
    expect(nouvelle.dateFin).toBeNull()

    // Une seule affectation active sur cette fonction.
    const actives = (await app.inject({
      method: 'GET',
      url: '/affectations/actives',
      headers: auth('ADMIN'),
    })).json()
    const activesFonction = actives.filter((a: any) => a.fonctionId === fonctionId)
    expect(activesFonction).toHaveLength(1)
    expect(activesFonction[0].membreId).toBe('m-2')
  })

  it('trois nominations successives → historique de 3, une seule active', async () => {
    const fonctionId = await creerFonction('Secrétaire')
    await affecter({ fonctionId, membreId: 'm-1', dateDebut: D1 })
    await affecter({ fonctionId, membreId: 'm-2', dateDebut: D2 })
    await affecter({ fonctionId, membreId: 'm-3', dateDebut: D3 })
    const histo = (await historique(fonctionId)).json()
    expect(histo).toHaveLength(3)
    expect(histo.filter((a: any) => a.dateFin === null)).toHaveLength(1)
    expect(histo.find((a: any) => a.dateFin === null).membreId).toBe('m-3')
  })

  /* Cumul de fonctions par un membre --------------------------------------- */

  it('un membre peut occuper plusieurs fonctions simultanément', async () => {
    const f1 = await creerFonction('Président')
    const f2 = await creerFonction('Trésorier')
    await affecter({ fonctionId: f1, membreId: 'm-1', dateDebut: D1 })
    await affecter({ fonctionId: f2, membreId: 'm-1', dateDebut: D1 })
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m-1/affectations',
      headers: auth('MEMBRE_SIMPLE'),
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(2)
    // Les deux sont actives (aucune restriction de cumul côté membre).
    expect(list.every((a: any) => a.dateFin === null)).toBe(true)
    expect(list.map((a: any) => a.fonction.nom).sort()).toEqual(['Président', 'Trésorier'])
  })

  /* Validations ------------------------------------------------------------- */

  it('refuse une dateDebut <= à celle du titulaire actif (400)', async () => {
    const fonctionId = await creerFonction('Président')
    await affecter({ fonctionId, membreId: 'm-1', dateDebut: D2 })
    const res = await affecter({ fonctionId, membreId: 'm-2', dateDebut: D1 }) // antérieure
    expect(res.statusCode).toBe(400)
    // L'ancienne reste active, aucune nouvelle créée.
    const histo = (await historique(fonctionId)).json()
    expect(histo).toHaveLength(1)
    expect(histo[0].dateFin).toBeNull()
  })

  it('404 si la fonction est inconnue', async () => {
    const res = await affecter({ fonctionId: 'inconnue', membreId: 'm-1', dateDebut: D1 })
    expect(res.statusCode).toBe(404)
  })

  it('404 si le membre est inconnu', async () => {
    const fonctionId = await creerFonction('Président')
    const res = await affecter({ fonctionId, membreId: 'm-inconnu', dateDebut: D1 })
    expect(res.statusCode).toBe(404)
  })

  it('404 sur l’historique d’une fonction inconnue', async () => {
    const res = await historique('inconnue', 'ADMIN')
    expect(res.statusCode).toBe(404)
  })

  it('404 sur les affectations d’un membre inconnu', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/membres/m-inconnu/affectations',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(404)
  })

  /* Permissions ------------------------------------------------------------- */

  it('SECRETAIRE peut nommer (201)', async () => {
    const fonctionId = await creerFonction('Président')
    const res = await affecter({ fonctionId, membreId: 'm-1', dateDebut: D1 }, 'SECRETAIRE')
    expect(res.statusCode).toBe(201)
  })

  it('MEMBRE_SIMPLE ne peut pas nommer (403) mais lit les actives (200)', async () => {
    const fonctionId = await creerFonction('Président')
    const create = await affecter({ fonctionId, membreId: 'm-1', dateDebut: D1 }, 'MEMBRE_SIMPLE')
    expect(create.statusCode).toBe(403)
    const read = await app.inject({
      method: 'GET',
      url: '/affectations/actives',
      headers: auth('MEMBRE_SIMPLE'),
    })
    expect(read.statusCode).toBe(200)
  })

  it('GUIDE_RELIGIEUX : aucun droit (403 en lecture des actives)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/affectations/actives',
      headers: auth('GUIDE_RELIGIEUX'),
    })
    expect(res.statusCode).toBe(403)
  })
})
