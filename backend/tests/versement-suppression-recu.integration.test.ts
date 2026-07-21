import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * RÉGRESSION (prod 2026-07-21) — suppression/modification d'un versement porteur d'un reçu, contre
 * une VRAIE base.
 *
 * Le défaut : la garde de suppression ne bloquait que sur un reçu ACTIF, alors que la FK
 * `Recu.versementId` est `onDelete: Restrict` INCONDITIONNEL (elle ignore `annuleLe`). Reçu annulé
 * → la garde applicative laissait passer → la base refusait → `DriverAdapterError` brute, hors de
 * tout mappage typé → **500 « une erreur inattendue s'est produite »** côté utilisateur.
 *
 * Pourquoi ce test NE PEUT PAS être mocké — et pourquoi il existe : le test unitaire équivalent
 * (`versement.service.test.ts`) affirmait exactement l'INVERSE et passait au vert, parce qu'un `tx`
 * mocké n'a pas de clé étrangère. L'invariant est porté par le SCHÉMA ; seule une vraie Postgres
 * peut l'attester. C'est le cas d'école du « build vert qui ne valide pas un invariant ».
 *
 * Exige `DATABASE_URL` + `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (cf. CLAUDE.md, famille
 * `*.integration.test.ts`).
 */

const ORG = 'c0000000-0000-4000-8000-0000000000e2'
const EMAIL = `vsr-${ORG}@test.local`
const PASSWORD = 'secret-123'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })

let app: FastifyInstance
let token = ''
/** Versement dont le seul reçu est ANNULÉ — le cas qui rendait 500 en production. */
let versementRecuAnnuleId = ''
/** Versement dont le reçu est ACTIF. */
let versementRecuActifId = ''
/** Versement SANS aucun reçu — le chemin nominal doit rester ouvert. */
let versementSansRecuId = ''

async function nettoyer(): Promise<void> {
  // Les PATCH/DELETE du test passent par l'extension d'audit (V2 §5) et laissent des `AuditLog`
  // qui référencent l'org — à purger AVANT elle, sinon `AuditLog_organisationId_fkey` bloque.
  await base.auditLog.deleteMany({ where: { organisationId: ORG } })
  await base.recu.deleteMany({ where: { organisationId: ORG } })
  await base.versement.deleteMany({ where: { organisationId: ORG } })
  await base.contribution.deleteMany({ where: { organisationId: ORG } })
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  await base.utilisateur.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

/** Crée un versement de 2 000 sur la contribution donnée, et renvoie son id. */
async function creerVersement(contributionId: string): Promise<string> {
  const v = await base.versement.create({
    data: {
      organisationId: ORG,
      contributionId,
      montant: 2000,
      dateVersement: new Date('2025-06-01T00:00:00Z'),
      mode: 'ESPECES',
    },
  })
  return v.id
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'VersementRecu', devise: 'FCFA' } })
  const u = await base.utilisateur.create({
    data: {
      organisationId: ORG,
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      role: 'ADMIN',
    },
  })
  const m = await base.membre.create({
    data: { organisationId: ORG, nom: 'Djoumessi', prenom: 'Romel', anneeAdhesion: 2024 },
  })
  const c = await base.contribution.create({
    data: { organisationId: ORG, membreId: m.id, annee: 2025, montantAttendu: 12000 },
  })

  versementRecuAnnuleId = await creerVersement(c.id)
  versementRecuActifId = await creerVersement(c.id)
  versementSansRecuId = await creerVersement(c.id)

  await base.recu.create({
    data: {
      organisationId: ORG,
      versementId: versementRecuAnnuleId,
      numero: 'NKONI-2025-000101',
      genereParId: u.id,
      annuleLe: new Date('2025-06-15T00:00:00Z'),
      annuleParId: u.id,
      motifAnnulation: 'montant erroné',
    },
  })
  await base.recu.create({
    data: {
      organisationId: ORG,
      versementId: versementRecuActifId,
      numero: 'NKONI-2025-000102',
      genereParId: u.id,
    },
  })

  app = await buildApp({ logger: false })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: EMAIL, password: PASSWORD },
  })
  token = login.json().accessToken
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

/** En-têtes d'auth — FONCTION et non constante : `token` n'est peuplé qu'au `beforeAll`. */
const auth = () => ({ authorization: `Bearer ${token}` })

describe('DELETE /versements/:id — garde reçu contre une vraie base', () => {
  it('reçu ANNULÉ → 409 explicite nommant le reçu (et NON 500)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementRecuAnnuleId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    // Le cœur de la régression : c'était 500 « erreur inattendue » avant le fix.
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('NKONI-2025-000101')
  })

  it('reçu ACTIF → 409', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementRecuActifId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('NKONI-2025-000102')
  })

  it('le versement refusé est TOUJOURS en base (aucune suppression partielle)', async () => {
    const encore = await base.versement.findUnique({ where: { id: versementRecuAnnuleId } })
    expect(encore).not.toBeNull()
  })

  it('SANS reçu → 204, le chemin nominal reste ouvert', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementSansRecuId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
    expect(await base.versement.findUnique({ where: { id: versementSansRecuId } })).toBeNull()
  })
})

describe('La FK Restrict est bien inconditionnelle (ce que le mock ne peut pas prouver)', () => {
  it('un DELETE direct en base, garde applicative contournée, est refusé même si le reçu est ANNULÉ', async () => {
    // C'est CE comportement de la base qui invalidait l'ancienne garde. Si un jour la FK passait en
    // SetNull/Cascade, ce test tomberait — et il faudrait alors revoir la garde EN MÊME TEMPS, ce
    // qui est précisément le couplage qu'on veut rendre visible.
    await expect(
      base.versement.delete({ where: { id: versementRecuAnnuleId } }),
    ).rejects.toThrow()
  })
})

describe('PATCH /versements/:id — la garde symétrique doit aussi être mappée', () => {
  it('reçu ACTIF → 409 nommant le reçu (et NON 500 : le mappage manquait dans la route)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/versements/${versementRecuActifId}`,
      headers: auth(),
      payload: { montant: 9000 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('NKONI-2025-000102')
  })

  it('reçu ANNULÉ → la modification RESTE possible (c’est la voie de correction)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/versements/${versementRecuAnnuleId}`,
      headers: auth(),
      payload: { montant: 3000 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().montant).toBe(3000)
  })
})
