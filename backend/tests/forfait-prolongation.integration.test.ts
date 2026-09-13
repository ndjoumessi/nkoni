import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * PROLONGATION DE L'ÉCHÉANCE DU FORFAIT (spec 1.1 §3.1) contre une VRAIE Postgres.
 *
 * Pourquoi ce test ne peut pas être mocké : l'`updateMany` conditionnel du
 * service compare un `DateTime?` (`forfaitExpireLe`) — IS NULL d'un côté, égalité en MILLISECONDES
 * de l'autre (colonne `TIMESTAMP(3)`) — et un mock JS reproduit fidèlement ce qu'on lui dit de
 * reproduire, jamais ce que Postgres accepte ou refuse réellement. Même chose pour l'effacement de
 * l'échéance au passage en GRATUIT : un mock ne prouve que la forme de l'appel, pas que la colonne
 * change bien de valeur en base.
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`) + `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`.
 */

const ORG = 'e5000000-0000-4000-8000-000000000051'
const SUPERADMIN_EMAIL = 'super-admin@forfait-prolongation-it.local'
const SUPERADMIN_PASSWORD = 'secret-superadmin-123'

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance
let jeton = ''

async function nettoyer(): Promise<void> {
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: ORG } })
  // `RefreshToken` n'a pas de relation Prisma vers Utilisateur (identifiant brut) : filtre par id.
  const superAdmin = await base.utilisateur.findUnique({ where: { email: SUPERADMIN_EMAIL }, select: { id: true } })
  if (superAdmin) {
    await base.refreshToken.deleteMany({ where: { utilisateurId: superAdmin.id } })
  }
  await base.utilisateur.deleteMany({ where: { email: SUPERADMIN_EMAIL } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

/** Remet l'organisation dans un état de départ précis (forfait + échéance). */
async function preparer(forfait: 'PRO' | 'ENTREPRISE' | 'GRATUIT', forfaitExpireLe: Date | null): Promise<void> {
  await base.organisation.upsert({
    where: { id: ORG },
    create: { id: ORG, nom: 'Prolongation Forfait IT', devise: 'FCFA', forfait, forfaitExpireLe },
    update: { forfait, forfaitExpireLe },
  })
}

const echeanceEnBase = async (): Promise<Date | null> =>
  (await base.organisation.findUniqueOrThrow({ where: { id: ORG }, select: { forfaitExpireLe: true } }))
    .forfaitExpireLe

const entetes = () => ({ authorization: `Bearer ${jeton}` })
const prolonger = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/platform/organisations/${ORG}/forfait/prolonger`,
    headers: entetes(),
    payload,
  })

beforeAll(async () => {
  await nettoyer()
  // Bootstrap SUPER_ADMIN (miroir de `prisma/seed-superadmin.ts`) : organisationId ABSENT → NULL,
  // seul état que la contrainte CHECK `Utilisateur_superadmin_org_check` autorise pour ce rôle.
  await base.utilisateur.create({
    data: {
      email: SUPERADMIN_EMAIL,
      passwordHash: await hashPassword(SUPERADMIN_PASSWORD),
      role: 'SUPER_ADMIN',
      actif: true,
    },
  })
  app = await buildApp({ logger: false })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
  })
  expect(login.statusCode).toBe(200)
  jeton = login.json().accessToken
  expect(jeton).toBeTruthy()
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

describe('Prolongation du forfait — écriture liée à l’aperçu, contre une vraie Postgres', () => {
  beforeEach(async () => {
    await preparer('PRO', null)
  })

  it('1. PRO sans échéance : aperçu 1 mois, écriture avec ses valeurs → 200, base = date de l’aperçu (ms exactes)', async () => {
    const apercu = (await prolonger({ mois: 1, apercu: true })).json()
    expect(apercu.echeanceActuelle).toBeNull()

    const res = await prolonger({
      mois: 1,
      apercu: false,
      echeanceAttendue: null,
      nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().nouvelleEcheance).toBe(apercu.nouvelleEcheance)

    const enBase = await echeanceEnBase()
    expect(enBase).not.toBeNull()
    expect(enBase?.toISOString()).toBe(apercu.nouvelleEcheance)
  })

  it('2. rejouer EXACTEMENT le même corps → 409, la date en base ne bouge pas (le double clic ne prolonge pas deux fois)', async () => {
    const apercu = (await prolonger({ mois: 1, apercu: true })).json()
    const corps = {
      mois: 1,
      apercu: false,
      echeanceAttendue: null,
      nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
    }
    const premiere = await prolonger(corps)
    expect(premiere.statusCode).toBe(200)
    const echeanceApresPremiere = await echeanceEnBase()

    // Rejeu du MÊME corps (réponse perdue, second clic…) : l'échéance lue par le service n'est
    // plus `null` — le contrôle `echeanceAttendue` (toujours `null` dans ce corps rejoué) doit
    // désormais échouer.
    const seconde = await prolonger(corps)
    expect(seconde.statusCode).toBe(409)
    expect(await echeanceEnBase()).toEqual(echeanceApresPremiere)
  })

  it('3. nouvel aperçu puis écriture avec ses valeurs → 200 (la condition sur une échéance NON nulle fonctionne en ms)', async () => {
    // Premier tour : PRO sans échéance → prolonge 1 mois.
    const premierApercu = (await prolonger({ mois: 1, apercu: true })).json()
    await prolonger({
      mois: 1,
      apercu: false,
      echeanceAttendue: null,
      nouvelleEcheanceAttendue: premierApercu.nouvelleEcheance,
    })
    const echeanceIntermediaire = await echeanceEnBase()
    expect(echeanceIntermediaire).not.toBeNull()

    // Second tour : un NOUVEL aperçu part cette fois d'une échéance NON nulle.
    const secondApercu = (await prolonger({ mois: 3, apercu: true })).json()
    expect(secondApercu.echeanceActuelle).toBe(echeanceIntermediaire?.toISOString())

    const res = await prolonger({
      mois: 3,
      apercu: false,
      echeanceAttendue: secondApercu.echeanceActuelle,
      nouvelleEcheanceAttendue: secondApercu.nouvelleEcheance,
    })
    expect(res.statusCode).toBe(200)
    const enBase = await echeanceEnBase()
    expect(enBase?.toISOString()).toBe(secondApercu.nouvelleEcheance)
  })

  it('4. passage en GRATUIT efface l’échéance en base ; prolonger ensuite → 409', async () => {
    // Organisation PRO AVEC échéance, puis repassée en GRATUIT via la route plateforme dédiée.
    await preparer('PRO', new Date('2030-01-01T22:59:59.999Z'))
    const changement = await app.inject({
      method: 'PATCH',
      url: `/platform/organisations/${ORG}/forfait`,
      headers: entetes(),
      payload: { forfait: 'GRATUIT' },
    })
    expect(changement.statusCode).toBe(200)
    expect(await echeanceEnBase()).toBeNull()

    // Un aperçu obtenu AVANT le passage en GRATUIT (ou une valeur reconstituée à la main) ne
    // matche plus rien : le forfait GRATUIT n'a pas d'échéance → 409 (avant même le contrôle des valeurs attendues).
    const res = await prolonger({
      mois: 1,
      apercu: false,
      echeanceAttendue: null,
      nouvelleEcheanceAttendue: new Date('2030-02-01T22:59:59.999Z').toISOString(),
    })
    expect(res.statusCode).toBe(409)
    expect(await echeanceEnBase()).toBeNull()
  })
})
