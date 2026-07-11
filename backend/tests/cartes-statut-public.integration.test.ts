import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { signerStatutMembre } from '../src/lib/recu-lien'
import type { BlobClient } from '../src/services/document.service'
import type { WhatsAppClient } from '../src/services/whatsapp.service'

/**
 * RÉGRESSION (§4.7) — `GET /membres/:id/statut-public?t=<signature>` contre une VRAIE base.
 *
 * Page publique de vérification (QR des cartes de membre) : PAS d'auth, la signature HMAC tient
 * lieu d'autorisation, l'org du membre est résolue `runUnscoped` (avec `await` interne, cf. §4.6)
 * puis le statut est calculé DANS le contexte de cette org. Vérifie 200 + HTML + isolation, et
 * qu'aucun montant n'est exposé.
 */

const ORG = 'c0000000-0000-4000-8000-0000000000f2'
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })

const blob: BlobClient = { put: async () => ({ url: 'x' }), del: async () => {}, lireContenu: async () => null }
const whatsapp: WhatsAppClient = { disponible: () => false, envoyerDocument: async () => ({ ok: false }) }

let app: FastifyInstance
let membreId = ''

async function nettoyer(): Promise<void> {
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  await base.baremeAnnuel.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'Famille Test', devise: 'FCFA', langueDefaut: 'FR' } })
  const m = await base.membre.create({
    data: { organisationId: ORG, nom: 'Djoumessi', prenom: 'Romel', anneeAdhesion: 2024 },
  })
  membreId = m.id
  app = await buildApp({ blob, whatsapp, logger: false })
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

describe('GET /membres/:id/statut-public — page publique QR (intégration)', () => {
  it('signature valide → 200 + HTML avec le membre (régression runUnscoped hors contexte)', async () => {
    const sig = signerStatutMembre(membreId)
    const res = await app.inject({
      method: 'GET',
      url: `/membres/${membreId}/statut-public?t=${encodeURIComponent(sig)}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('Romel')
    expect(res.body).toContain('Djoumessi')
    expect(res.body).toContain('Famille Test')
    // Aucun montant/devise exposé sur la page publique (seuls statut + année y figurent).
    expect(res.body).not.toContain('FCFA')
  })

  it('signature invalide → 404 (pas de fuite)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/membres/${membreId}/statut-public?t=signature-bidon`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('membre inexistant avec sa propre signature → 404', async () => {
    const idInconnu = 'a0000000-0000-4000-8000-0000000000fe'
    const res = await app.inject({
      method: 'GET',
      url: `/membres/${idInconnu}/statut-public?t=${encodeURIComponent(signerStatutMembre(idInconnu))}`,
    })
    expect(res.statusCode).toBe(404)
  })
})
