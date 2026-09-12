import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * RÉGRESSION (SaaS §3.1) — le quota de membres porte sur les membres ACTIFS, sur les TROIS voies
 * qui peuvent en ajouter : création, import, réactivation.
 *
 * Défaut corrigé : l'écran Paramètres affichait les membres ACTIFS face à la limite
 * (`organisation.service` : `count({ where: { statut: 'ACTIF' } })`), mais la création et l'import
 * comptaient TOUS les membres (`membre.count()` sans filtre) et la réactivation ne contrôlait rien.
 * Une association gratuite à 45 actifs + 10 inactifs lisait « 45 / 50 » et ne pouvait ajouter
 * personne ; à l'inverse, réactiver des fiches permettait de dépasser 50 actifs.
 *
 * Ce test ne peut PAS être mocké : les mocks de `membre.count` ignorent le `where` — un test
 * unitaire passerait à vide. Le comptage filtré n'est prouvé que par une vraie base.
 */

const ORG = 'd4000000-0000-4000-8000-000000000041'
const EMAIL = 'admin@quota-membres-it.local'
const PASSWORD = 'secret-quota-123'
const PLAFOND = 50

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance
let jeton = ''

async function nettoyer(): Promise<void> {
  // Ce test passe par l'API : créations et modifications de membres sont AUDITÉES, et `AuditLog`
  // retient l'organisation (FK Restrict) — à vider avant de pouvoir supprimer l'organisation.
  await base.auditLog.deleteMany({ where: { organisationId: ORG } })
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  // `RefreshToken` n'a pas de relation Prisma vers Utilisateur (identifiant brut) : filtre par ids.
  const comptes = await base.utilisateur.findMany({ where: { organisationId: ORG }, select: { id: true } })
  await base.refreshToken.deleteMany({ where: { utilisateurId: { in: comptes.map((c) => c.id) } } })
  await base.utilisateur.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

/** Remet l'organisation (forfait GRATUIT) dans un état exact : `actifs` + `inactifs` fiches. */
async function preparer(actifs: number, inactifs: number): Promise<string[]> {
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  const ligne = (i: number, statut: 'ACTIF' | 'INACTIF') => ({
    organisationId: ORG, nom: `Nom${statut}${i}`, prenom: 'Test', anneeAdhesion: 2020, statut,
  })
  await base.membre.createMany({
    data: [
      ...Array.from({ length: actifs }, (_, i) => ligne(i, 'ACTIF')),
      ...Array.from({ length: inactifs }, (_, i) => ligne(i, 'INACTIF')),
    ],
  })
  const fiches = await base.membre.findMany({ where: { organisationId: ORG, statut: 'INACTIF' }, select: { id: true } })
  return fiches.map((f) => f.id)
}

const actifsEnBase = () => base.membre.count({ where: { organisationId: ORG, statut: 'ACTIF' } })
const entetes = () => ({ authorization: `Bearer ${jeton}` })

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'Quota Membres IT', devise: 'FCFA' } })
  await base.utilisateur.create({
    data: { organisationId: ORG, email: EMAIL, passwordHash: await hashPassword(PASSWORD), role: 'ADMIN' },
  })
  app = await buildApp({ logger: false })
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMAIL, password: PASSWORD } })
  jeton = login.json().accessToken
  expect(jeton).toBeTruthy()
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

describe('quota de membres — les fiches inactives ne consomment pas le quota', () => {
  beforeEach(async () => {
    expect((await base.organisation.findUnique({ where: { id: ORG } }))?.forfait).toBe('GRATUIT')
  })

  it('création : 49 actifs + 10 inactifs → un 50ᵉ actif est accepté', async () => {
    await preparer(PLAFOND - 1, 10)
    const res = await app.inject({
      method: 'POST', url: '/membres', headers: entetes(),
      payload: { nom: 'Nouveau', prenom: 'Actif', anneeAdhesion: 2024 },
    })
    expect(res.statusCode).toBe(201)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })

  it('création : 50 actifs → un 51ᵉ actif est refusé (403), rien n’est écrit', async () => {
    await preparer(PLAFOND, 0)
    const res = await app.inject({
      method: 'POST', url: '/membres', headers: entetes(),
      payload: { nom: 'Refuse', prenom: 'Actif', anneeAdhesion: 2024 },
    })
    expect(res.statusCode).toBe(403)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })

  it('création : 50 actifs → une fiche INACTIVE reste acceptée (elle ne consomme pas le quota)', async () => {
    await preparer(PLAFOND, 0)
    const res = await app.inject({
      method: 'POST', url: '/membres', headers: entetes(),
      payload: { nom: 'Ancien', prenom: 'Inactif', anneeAdhesion: 2019, statut: 'INACTIF' },
    })
    expect(res.statusCode).toBe(201)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })

  it('réactivation : 50 actifs → repasser une fiche inactive en ACTIF est refusé (403)', async () => {
    const [inactif] = await preparer(PLAFOND, 1)
    const res = await app.inject({
      method: 'PATCH', url: `/membres/${inactif}`, headers: entetes(), payload: { statut: 'ACTIF' },
    })
    expect(res.statusCode).toBe(403)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })

  it('réactivation : 49 actifs → la réactivation d’une fiche est acceptée', async () => {
    const [inactif] = await preparer(PLAFOND - 1, 1)
    const res = await app.inject({
      method: 'PATCH', url: `/membres/${inactif}`, headers: entetes(), payload: { statut: 'ACTIF' },
    })
    expect(res.statusCode).toBe(200)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })

  it('modification d’un membre DÉJÀ actif au plafond : jamais bloquée', async () => {
    await preparer(PLAFOND, 0)
    const actif = await base.membre.findFirstOrThrow({ where: { organisationId: ORG, statut: 'ACTIF' } })
    const res = await app.inject({
      method: 'PATCH', url: `/membres/${actif.id}`, headers: entetes(), payload: { telephone: '670000000', statut: 'ACTIF' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('import : 49 actifs + 10 inactifs → importer 1 actif n’est pas un dépassement', async () => {
    await preparer(PLAFOND - 1, 10)
    const res = await app.inject({
      method: 'POST', url: '/membres/import', headers: entetes(),
      payload: { valider: true, membres: [{ nom: 'Importe', prenom: 'Actif', anneeAdhesion: 2024 }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().quota).toMatchObject({ actuel: PLAFOND - 1, aCreer: 1, depasse: false })
  })

  it('import : 50 actifs → importer des fiches INACTIVES n’est pas un dépassement', async () => {
    await preparer(PLAFOND, 0)
    const res = await app.inject({
      method: 'POST', url: '/membres/import', headers: entetes(),
      payload: { valider: true, membres: [{ nom: 'Ancien', prenom: 'Importe', anneeAdhesion: 2018, statut: 'INACTIF' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().quota).toMatchObject({ actuel: PLAFOND, aCreer: 0, depasse: false })
  })

  it('import : 50 actifs → importer 1 actif reste un dépassement (403 au commit)', async () => {
    await preparer(PLAFOND, 0)
    const res = await app.inject({
      method: 'POST', url: '/membres/import', headers: entetes(),
      payload: { membres: [{ nom: 'Importe', prenom: 'EnTrop', anneeAdhesion: 2024 }] },
    })
    expect(res.statusCode).toBe(403)
    expect(await actifsEnBase()).toBe(PLAFOND)
  })
})
