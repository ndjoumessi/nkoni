import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Isolation multi-tenant PAR ENDPOINT (SaaS §2.2, Phase C4) — sur l'application RÉELLE
 * (client Prisma étendu), 2 organisations, pour les modules FINANCIERS et CONFIDENTIELS :
 * contributions, versements, reçus, barèmes, conflits, réunions, documents, dashboard.
 *
 * Pour chaque endpoint on prouve, connecté en org A, qu'AUCUNE fuite de l'org B n'est
 * possible : ni en LISTE, ni en ACCÈS DIRECT PAR ID (404, y compris en mutation), ni dans
 * les AGRÉGATS financiers (dashboard). Une valeur sentinelle (987654) marque les données de
 * B : sa présence dans une réponse de A signerait une fuite.
 */

const ORG_A = 'a2000000-0000-4000-8000-000000000001'
const ORG_B = 'b2000000-0000-4000-8000-000000000002'
const EMAIL_A = 'admin-a@endpoints-it.local'
const EMAIL_B = 'admin-b@endpoints-it.local'
const PASSWORD = 'secret-123'
const ANNEE = new Date().getFullYear() // le dashboard agrège l'année courante
const SENTINELLE_B = 987654 // montant distinctif des données de B (marqueur de fuite)

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance

// Ids des ressources de l'org B (cibles des tentatives d'accès direct cross-org).
const B: Record<string, string> = {}

/** Nettoyage idempotent via `base` (non scopé). Ordre FK : enfants → parents → orgs. */
async function nettoyer(): Promise<void> {
  const orgs = { organisationId: { in: [ORG_A, ORG_B] } }
  await base.recu.deleteMany({ where: orgs })
  await base.versement.deleteMany({ where: orgs })
  await base.contribution.deleteMany({ where: orgs })
  await base.baremeAnnuel.deleteMany({ where: orgs })
  await base.document.deleteMany({ where: orgs })
  await base.reunion.deleteMany({ where: orgs })
  await base.conflit.deleteMany({ where: orgs })
  await base.membre.deleteMany({ where: orgs })
  await base.utilisateur.deleteMany({ where: orgs })
  await base.organisation.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
}

/** Sème un jeu complet (membre → contribution → versement → reçu, + conflit/réunion/document)
 *  pour une organisation. `montant` marque les valeurs financières (sentinelle pour B). */
async function semer(orgId: string, email: string, montant: number): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  const user = await base.utilisateur.create({
    data: { organisationId: orgId, email, passwordHash: await hashPassword(PASSWORD), role: 'ADMIN' },
  })
  ids['user'] = user.id
  const membre = await base.membre.create({
    data: { organisationId: orgId, nom: 'Nom', prenom: 'Prenom', anneeAdhesion: 2020 },
  })
  ids['membre'] = membre.id
  const bareme = await base.baremeAnnuel.create({
    data: { organisationId: orgId, annee: ANNEE, montantAttendu: montant },
  })
  ids['bareme'] = bareme.id
  const contribution = await base.contribution.create({
    data: {
      organisationId: orgId,
      membreId: membre.id,
      annee: ANNEE,
      montantAttendu: montant,
      montantVerse: montant,
      montantValorise: montant,
    },
  })
  ids['contribution'] = contribution.id
  const versement = await base.versement.create({
    data: {
      organisationId: orgId,
      contributionId: contribution.id,
      montant,
      dateVersement: new Date(`${ANNEE}-01-15T00:00:00Z`),
      mode: 'ESPECES',
    },
  })
  ids['versement'] = versement.id
  const recu = await base.recu.create({
    data: {
      organisationId: orgId,
      versementId: versement.id,
      numero: `NKONI-${ANNEE}-000001`,
      genereParId: user.id,
      // Snapshot NOT NULL (migration `recu_orphelin_snapshot_membre`).
      membreId: membre.id,
      montant,
      dateVersement: new Date(`${ANNEE}-01-15T00:00:00Z`),
      annee: ANNEE,
      mode: 'ESPECES',
    },
  })
  ids['recu'] = recu.id
  const conflit = await base.conflit.create({
    data: {
      organisationId: orgId,
      titre: 'Litige',
      description: 'desc',
      niveauConfidentialite: 'PUBLIC', // même PUBLIC ne doit pas fuiter cross-org
      auteurId: user.id,
    },
  })
  ids['conflit'] = conflit.id
  const reunion = await base.reunion.create({
    data: { organisationId: orgId, date: new Date(`${ANNEE}-02-01T00:00:00Z`), lieu: 'Lieu' },
  })
  ids['reunion'] = reunion.id
  const document = await base.document.create({
    data: {
      organisationId: orgId,
      nom: 'piece.pdf',
      url: 'https://blob.local/piece.pdf',
      typeFichier: 'application/pdf',
      tailleOctets: 10,
      entiteType: 'MEMBRE',
      entiteId: membre.id,
      televerseParId: user.id,
    },
  })
  ids['document'] = document.id
  return ids
}

let tokenA = ''

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG_A, nom: 'Endpoints A', devise: 'FCFA' } })
  await base.organisation.create({ data: { id: ORG_B, nom: 'Endpoints B', devise: 'FCFA' } })
  await semer(ORG_A, EMAIL_A, 5_000)
  const idsB = await semer(ORG_B, EMAIL_B, SENTINELLE_B)
  Object.assign(B, idsB)

  app = await buildApp({ logger: false })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: EMAIL_A, password: PASSWORD },
  })
  tokenA = login.json().accessToken
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

/** GET authentifié en tant qu'admin de l'org A. */
function getA(url: string) {
  return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tokenA}` } })
}

/** La réponse (liste JSON) ne contient AUCun élément de l'org B (ni par id, ni par sentinelle). */
function aucuneFuiteListe(items: Array<Record<string, unknown>>, idB: string): void {
  expect(Array.isArray(items)).toBe(true)
  expect(items.some((x) => x['id'] === idB)).toBe(false)
  expect(JSON.stringify(items)).not.toContain(String(SENTINELLE_B))
}

describe('C4 — isolation par endpoint (modules financiers & confidentiels)', () => {
  it('GET /membres : liste scopée ; /membres/:id (org B) → 404', async () => {
    const liste = await getA('/membres')
    expect(liste.statusCode).toBe(200)
    expect(liste.json().some((m: { id: string }) => m.id === B['membre'])).toBe(false)
    const direct = await getA(`/membres/${B['membre']}`)
    expect(direct.statusCode).toBe(404)
  })

  it('GET /contributions : liste scopée (aucune contribution de B, pas de montant sentinelle)', async () => {
    const res = await getA('/contributions')
    expect(res.statusCode).toBe(200)
    aucuneFuiteListe(res.json(), B['contribution']!)
  })

  it('GET /versements : liste scopée ; PATCH /versements/:id (org B) → 404', async () => {
    const res = await getA('/versements')
    expect(res.statusCode).toBe(200)
    aucuneFuiteListe(res.json(), B['versement']!)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/versements/${B['versement']}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { montant: 1 },
    })
    expect(patch.statusCode).toBe(404) // cross-org = introuvable (P2025 → 404), pas 500
  })

  it('GET /recus : liste scopée (aucun reçu de B, pas de numéro/montant de B)', async () => {
    const res = await getA('/recus')
    expect(res.statusCode).toBe(200)
    aucuneFuiteListe(res.json(), B['recu']!)
    expect(res.json().some((r: { versementId: string }) => r.versementId === B['versement'])).toBe(false)
  })

  it('GET /baremes : liste scopée ; PATCH /baremes/:id (org B) → 404', async () => {
    const res = await getA('/baremes')
    expect(res.statusCode).toBe(200)
    aucuneFuiteListe(res.json(), B['bareme']!)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/baremes/${B['bareme']}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { montantAttendu: 1 },
    })
    expect(patch.statusCode).toBe(404)
  })

  it('GET /conflits : liste scopée ; /conflits/:id (org B, même PUBLIC) → 404', async () => {
    const res = await getA('/conflits')
    expect(res.statusCode).toBe(200)
    expect(res.json().some((c: { id: string }) => c.id === B['conflit'])).toBe(false)
    const direct = await getA(`/conflits/${B['conflit']}`)
    expect(direct.statusCode).toBe(404) // l'existence même d'un conflit d'une autre org ne fuite pas
  })

  it('GET /reunions : liste scopée ; /reunions/:id (org B) → 404', async () => {
    const res = await getA('/reunions')
    expect(res.statusCode).toBe(200)
    expect(res.json().some((r: { id: string }) => r.id === B['reunion'])).toBe(false)
    const direct = await getA(`/reunions/${B['reunion']}`)
    expect(direct.statusCode).toBe(404)
  })

  it('GET /documents : liste scopée ; /documents/:id/contenu (org B) → 404', async () => {
    const res = await getA('/documents')
    expect(res.statusCode).toBe(200)
    expect(res.json().some((d: { id: string }) => d.id === B['document'])).toBe(false)
    const direct = await getA(`/documents/${B['document']}/contenu`)
    expect(direct.statusCode).toBe(404) // introuvable dans l'org A → pas de téléchargement du blob de B
  })

  it('GET /dashboard : les agrégats financiers n’incluent JAMAIS les montants de l’org B', async () => {
    const res = await getA('/dashboard')
    expect(res.statusCode).toBe(200)
    // La sentinelle (montant exclusif de B) ne doit apparaître nulle part dans l'agrégat de A.
    expect(JSON.stringify(res.json())).not.toContain(String(SENTINELLE_B))
  })
})
