import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import {
  lirePreferences,
  majPreferences,
  typeActif,
  TYPES_NOTIFICATION,
} from '../src/services/notification.service'
import { buildNotificationsMock } from './support/notifications-prisma-mock'

/**
 * Préférences de notification (§5) — par défaut tout activé (rétrocompatible), désactivation
 * ciblée par type, isolation par utilisateur. Service pur + routes GET/PATCH.
 */

describe('typeActif (pur)', () => {
  it('défaut activé : null / {} / clé absente → true ; seul false explicite désactive', () => {
    expect(typeActif(null, 'VERSEMENT_RECU')).toBe(true)
    expect(typeActif({}, 'VERSEMENT_RECU')).toBe(true)
    expect(typeActif({ COTISATION_RETARD: false }, 'VERSEMENT_RECU')).toBe(true)
    expect(typeActif({ VERSEMENT_RECU: false }, 'VERSEMENT_RECU')).toBe(false)
  })
})

describe('lire / maj préférences (service)', () => {
  it('utilisateur sans préférence → tout activé', async () => {
    const { prisma } = buildNotificationsMock({ utilisateurs: [{ id: 'u1' }] })
    expect(await lirePreferences(prisma, 'u1')).toEqual({
      VERSEMENT_RECU: true,
      COTISATION_RETARD: true,
      REUNION_RAPPEL: true,
    })
  })

  it('maj désactive un type et laisse l’autre actif', async () => {
    const { prisma } = buildNotificationsMock({ utilisateurs: [{ id: 'u1' }] })
    const apres = await majPreferences(prisma, 'u1', { COTISATION_RETARD: false })
    expect(apres).toEqual({ VERSEMENT_RECU: true, COTISATION_RETARD: false, REUNION_RAPPEL: true })
    // Persisté : une relecture renvoie le même état.
    expect(await lirePreferences(prisma, 'u1')).toEqual({
      VERSEMENT_RECU: true,
      COTISATION_RETARD: false,
      REUNION_RAPPEL: true,
    })
  })
})

describe('Routes préférences', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    const mock = buildNotificationsMock({ utilisateurs: [{ id: 'u-a' }, { id: 'u-b' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: mock.prisma as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (sub: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role: 'MEMBRE_SIMPLE' })}`,
  })

  it('GET /notifications/preferences → tout activé par défaut', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notifications/preferences',
      headers: auth('u-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ VERSEMENT_RECU: true, COTISATION_RETARD: true, REUNION_RAPPEL: true })
  })

  it('PATCH met à jour et GET reflète la désactivation', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/notifications/preferences',
      headers: auth('u-a'),
      payload: { VERSEMENT_RECU: false },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json()).toEqual({ VERSEMENT_RECU: false, COTISATION_RETARD: true, REUNION_RAPPEL: true })

    const get = await app.inject({
      method: 'GET',
      url: '/notifications/preferences',
      headers: auth('u-a'),
    })
    expect(get.json()).toEqual({ VERSEMENT_RECU: false, COTISATION_RETARD: true, REUNION_RAPPEL: true })
  })

  // RÉGRESSION : le schéma ajv des préférences porte `additionalProperties: false`. Tant que ses
  // propriétés étaient RECOPIÉES à la main, un type ajouté ailleurs (ici REUNION_RAPPEL) était
  // rejeté en 400 — interrupteur présent dans l'UI, préférence respectée par le scheduler, mais
  // INENREGISTRABLE. Les tests existants ne l'ont pas vu : ils affirmaient REUNION_RAPPEL dans la
  // RÉPONSE (il est dans les défauts) sans jamais l'ENVOYER. Ce cas l'envoie.
  it('PATCH accepte CHAQUE type de TYPES_NOTIFICATION (schéma dérivé, pas recopié)', async () => {
    for (const type of TYPES_NOTIFICATION) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/notifications/preferences',
        headers: auth('u-a'),
        payload: { [type]: false },
      })
      expect(res.statusCode, `le type ${type} doit être enregistrable`).toBe(200)
      expect(res.json()[type]).toBe(false)
    }
  })

  it('isolation : la préférence de u-a n’affecte pas u-b', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/notifications/preferences',
      headers: auth('u-a'),
      payload: { VERSEMENT_RECU: false },
    })
    const resB = await app.inject({
      method: 'GET',
      url: '/notifications/preferences',
      headers: auth('u-b'),
    })
    expect(resB.json()).toEqual({ VERSEMENT_RECU: true, COTISATION_RETARD: true, REUNION_RAPPEL: true })
  })
})
