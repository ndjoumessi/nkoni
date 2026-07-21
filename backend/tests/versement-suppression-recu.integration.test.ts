import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Suppression et modification d'un versement porteur d'un reçu, contre une VRAIE base.
 *
 * CE QUE CE FICHIER VÉRIFIE aujourd'hui : un versement dont le reçu est ANNULÉ se supprime, et le
 * reçu SURVIT en orphelin (`versementId` NULL via `onDelete: SetNull`) avec son SNAPSHOT intact —
 * c'est ce snapshot qui le garde affichable dans l'historique du membre. Un reçu ACTIF bloque
 * toujours. La ligne `Recu` doit survivre : `genererNumeroSequentiel` lit `max(numero)`, la
 * supprimer ferait réutiliser son numéro.
 *
 * POURQUOI CE FICHIER EXISTE — et pourquoi ses assertions ont été inversées deux fois :
 *  1. La garde ne bloquait que sur un reçu ACTIF alors que la FK était `Restrict` INCONDITIONNEL.
 *     La garde laissait passer, la base refusait, l'utilisateur voyait « une erreur inattendue »
 *     (500 vécu en production le 2026-07-21). Le test unitaire équivalent affirmait l'inverse et
 *     passait au vert : un `tx` mocké n'a pas de clé étrangère.
 *  2. On a aligné la garde sur la FK (bloquer sur TOUT reçu).
 *  3. On a inversé la FK (`SetNull`) pour rendre la suppression possible sans perdre la trace.
 *
 * La leçon tient dans ce va-et-vient : le mock prouve que la GARDE interroge le bon ensemble, cette
 * base prouve que la CONTRAINTE est d'accord. Jamais l'un sans l'autre.
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
let membreId = ''
let utilisateurId = ''

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

/**
 * Hash calculé UNE fois : argon2 est volontairement lent, le refaire à chaque cas multiplierait
 * la durée du fichier par le nombre de tests.
 */
let hash = ''

beforeAll(async () => {
  hash = await hashPassword(PASSWORD)
  app = await buildApp({ logger: false })
})

/**
 * Réinitialisation AVANT CHAQUE cas — indispensable ici : plusieurs tests suppriment le MÊME
 * versement, et un état partagé les rendrait dépendants de leur ordre d'exécution.
 */
beforeEach(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'VersementRecu', devise: 'FCFA' } })
  const u = await base.utilisateur.create({
    data: {
      organisationId: ORG,
      email: EMAIL,
      passwordHash: hash,
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

  // SNAPSHOT obligatoire (NOT NULL) : c'est lui qui garde le reçu affichable une fois orphelin.
  const snapshot = {
    membreId: m.id,
    montant: 2000,
    dateVersement: new Date('2025-06-01T00:00:00Z'),
    annee: 2025,
    mode: 'ESPECES' as const,
  }
  await base.recu.create({
    data: {
      organisationId: ORG,
      versementId: versementRecuAnnuleId,
      numero: 'NKONI-2025-000101',
      genereParId: u.id,
      annuleLe: new Date('2025-06-15T00:00:00Z'),
      annuleParId: u.id,
      motifAnnulation: 'montant erroné',
      ...snapshot,
    },
  })
  await base.recu.create({
    data: {
      organisationId: ORG,
      versementId: versementRecuActifId,
      numero: 'NKONI-2025-000102',
      genereParId: u.id,
      ...snapshot,
    },
  })
  membreId = m.id
  utilisateurId = u.id

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
  it('reçu ANNULÉ → 204 : la suppression est PERMISE, le reçu survit en orphelin', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/versements/${versementRecuAnnuleId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
    expect(await base.versement.findUnique({ where: { id: versementRecuAnnuleId } })).toBeNull()

    // LA ligne qui compte : le reçu n'a PAS été supprimé en cascade, son `versementId` est passé
    // à NULL par Postgres, et son snapshot est intact — c'est ce qui le garde affichable.
    const orphelin = await base.recu.findFirst({ where: { numero: 'NKONI-2025-000101' } })
    expect(orphelin).not.toBeNull()
    expect(orphelin?.versementId).toBeNull()
    expect(orphelin?.membreId).toBe(membreId)
    expect(orphelin?.montant).toBe(2000)
    expect(orphelin?.annee).toBe(2025)
    // Le SET NULL ne touche qu'une colonne : l'orphelin reste scopé à son organisation, donc
    // lisible par l'extension tenant.
    expect(orphelin?.organisationId).toBe(ORG)
  })

  it('le numéro d’un reçu orphelin n’est JAMAIS réutilisé', async () => {
    // C'est la raison pour laquelle la ligne doit survivre : `genererNumeroSequentiel` lit
    // max(numero). Si l'orphelin avait été supprimé, la génération suivante reprendrait son
    // numéro — deux reçus différents, même numéro, dans le temps.
    await app.inject({
      method: 'DELETE',
      url: `/versements/${versementRecuAnnuleId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/versements/${versementSansRecuId}/recu`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().numero).not.toBe('NKONI-2025-000101')
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

  it('le versement à reçu ACTIF est TOUJOURS en base (aucune suppression partielle)', async () => {
    const encore = await base.versement.findUnique({ where: { id: versementRecuActifId } })
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

describe('Ce que seule une vraie base peut prouver', () => {
  it('un DELETE direct pose versementId à NULL — il ne supprime PAS le reçu en cascade', async () => {
    // Miroir de l'ancien test, qui vérifiait que la FK Restrict REFUSAIT ce delete. La FK est
    // désormais en SetNull : le comportement attendu s'inverse. Un mock ne prouve ni l'un ni
    // l'autre — il n'a pas de clé étrangère.
    await base.versement.delete({ where: { id: versementRecuAnnuleId } })
    const orphelin = await base.recu.findFirst({ where: { numero: 'NKONI-2025-000101' } })
    expect(orphelin).not.toBeNull()
    expect(orphelin?.versementId).toBeNull()
  })

  it('un membre porteur de reçus ne peut PAS être supprimé (Recu_membreId_fkey en Restrict)', async () => {
    // `membreId` est le SUJET du reçu, pas son auteur : un id pendant rendrait l'orphelin
    // invisible, donc la FK est en Restrict — contrairement à `genereParId`, scalaire sans
    // contrainte.
    await expect(base.membre.delete({ where: { id: membreId } })).rejects.toThrow()
  })

  it('le snapshot est OBLIGATOIRE : un reçu sans montant est refusé par la base', async () => {
    await expect(
      base.recu.create({
        data: {
          organisationId: ORG,
          numero: 'NKONI-2025-999999',
          genereParId: utilisateurId,
          membreId,
          // montant / dateVersement / annee / mode omis → NOT NULL doit refuser.
        } as never,
      }),
    ).rejects.toThrow()
  })

  it('AUCUN reçu ACTIF orphelin — l’invariant que la garde est seule à tenir', async () => {
    await base.versement.delete({ where: { id: versementRecuAnnuleId } })
    const violations = await base.recu.findMany({
      where: { versementId: null, annuleLe: null },
      select: { id: true, numero: true },
    })
    expect(violations).toEqual([])
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
