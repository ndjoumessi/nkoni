import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { signerRecu } from '../src/lib/recu-lien'
import type { BlobClient } from '../src/services/document.service'
import type { WhatsAppClient } from '../src/services/whatsapp.service'

/**
 * RÉGRESSION (§4.6) — `GET /recus/:id/pdf-public?t=<signature>` contre une VRAIE base.
 *
 * Bug corrigé (fix/recu-public-unscoped) : la route résout l'org du reçu via
 * `orgContext.runUnscoped(() => prisma.recu.findUnique(...))`. Une requête Prisma est PARESSEUSE
 * (ne s'exécute qu'au `await`) ; l'`await` ayant lieu HORS du `runUnscoped`, la requête tournait
 * hors contexte → l'extension d'isolation fail-close (« opération 'findUnique' sur 'Recu' hors
 * contexte d'organisation », 500). Le fix `await` DANS le callback `runUnscoped`.
 *
 * Ce test NE PEUT PAS être mocké : le piège vient de l'extension tenant réelle + de la paresse
 * de PrismaPromise, invisibles avec un mock. Il exige une vraie Postgres (DATABASE_URL) et
 * `JWT_ACCESS_SECRET` (utilisé par la signature du lien via son repli).
 */

const ORG = 'c0000000-0000-4000-8000-0000000000e1'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })

/** Blob factice : le PDF est généré en mémoire ; on évite tout appel réseau au store Vercel. */
const blob: BlobClient = {
  put: async () => ({ url: 'https://blob.test/recu.pdf' }),
  del: async () => {},
  lireContenu: async () => null,
}
const whatsapp: WhatsAppClient = {
  disponible: () => false,
  envoyerDocument: async () => ({ ok: false }),
}

let app: FastifyInstance
let recuId = ''

async function nettoyer(): Promise<void> {
  await base.recu.deleteMany({ where: { organisationId: ORG } })
  await base.versement.deleteMany({ where: { organisationId: ORG } })
  await base.contribution.deleteMany({ where: { organisationId: ORG } })
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  await base.utilisateur.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'RecuPublic', devise: 'FCFA' } })
  const u = await base.utilisateur.create({
    data: { organisationId: ORG, email: `rp-${ORG}@test.local`, passwordHash: 'x', role: 'ADMIN' },
  })
  const m = await base.membre.create({
    data: { organisationId: ORG, nom: 'Djoumessi', prenom: 'Romel', anneeAdhesion: 2024 },
  })
  const c = await base.contribution.create({
    data: { organisationId: ORG, membreId: m.id, annee: 2025, montantAttendu: 12000 },
  })
  const v = await base.versement.create({
    data: {
      organisationId: ORG,
      contributionId: c.id,
      montant: 12000,
      dateVersement: new Date('2025-06-01T00:00:00Z'),
      mode: 'ESPECES',
    },
  })
  const r = await base.recu.create({
    data: { organisationId: ORG, versementId: v.id, numero: 'NKONI-2025-000001', genereParId: u.id },
  })
  recuId = r.id

  app = await buildApp({ blob, whatsapp, logger: false })
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

describe('GET /recus/:id/pdf-public — lien public signé (intégration)', () => {
  it('signature valide → 200 + application/pdf (régression runUnscoped hors contexte)', async () => {
    const sig = signerRecu(recuId)
    const res = await app.inject({
      method: 'GET',
      url: `/recus/${recuId}/pdf-public?t=${encodeURIComponent(sig)}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.rawPayload.length).toBeGreaterThan(0)
  })

  it('signature invalide → 404 (pas de fuite)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/recus/${recuId}/pdf-public?t=signature-bidon`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('id inexistant avec sa propre signature → 404 (pas d’énumération)', async () => {
    const idInconnu = 'a0000000-0000-4000-8000-0000000000ff'
    const res = await app.inject({
      method: 'GET',
      url: `/recus/${idInconnu}/pdf-public?t=${encodeURIComponent(signerRecu(idInconnu))}`,
    })
    expect(res.statusCode).toBe(404)
  })
})
