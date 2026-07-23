import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { chiffrerSecret } from '../src/lib/crypto-secret'
import type { PspClient } from '../src/services/psp.service'

/**
 * RÉGRESSION (§ paiement) — confirmation d'un paiement en ligne via le webhook, contre une VRAIE base.
 *
 * Ce que SEULE l'intégration prouve (invisible au mock) : l'extension tenant réelle, la résolution
 * d'org en `runUnscoped` + la propagation `AsyncLocalStorage` À TRAVERS `$transaction`, l'invariant
 * financier (`Contribution.montantVerse`/`montantValorise` incrémentés dans la même tx), et surtout
 * l'IDEMPOTENCE dure portée par `Versement.idempotenceKey = referenceExterne` (unique par org) : un
 * webhook rejoué ne double PAS le versement.
 *
 * Exige une vraie Postgres (DATABASE_URL), `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, et
 * `PSP_ENCRYPTION_KEY` (posée ici pour chiffrer/déchiffrer la config PSP).
 */

const ORG = 'c0000000-0000-4000-8000-0000000000f7'
const TRANS_ID = 'TX-INTEGRATION-1'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })

/** PSP mocké : le webhook re-vérifie le statut → on renvoie REUSSI (source de vérité côté serveur). */
const psp: PspClient = {
  async initierCollecte() {
    return { referenceExterne: TRANS_ID, statut: 'EN_ATTENTE' }
  },
  async verifierStatut() {
    return 'REUSSI'
  },
  verifierSignatureWebhook() {
    return true
  },
}

let app: FastifyInstance
let contributionId = ''

async function nettoyer(): Promise<void> {
  // La confirmation crée un Versement (opération AUDITÉE) → des lignes AuditLog référencent l'org
  // en Restrict : les purger AVANT l'organisation, sinon sa suppression viole la FK (afterAll).
  await base.auditLog.deleteMany({ where: { organisationId: ORG } })
  await base.paiement.deleteMany({ where: { organisationId: ORG } })
  await base.recu.deleteMany({ where: { organisationId: ORG } })
  await base.versement.deleteMany({ where: { organisationId: ORG } })
  await base.contribution.deleteMany({ where: { organisationId: ORG } })
  await base.parametrePaiement.deleteMany({ where: { organisationId: ORG } })
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

beforeAll(async () => {
  process.env['PSP_ENCRYPTION_KEY'] ||= Buffer.alloc(32, 11).toString('base64')
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'PaiementInt', devise: 'FCFA' } })
  // Membre SANS compte lié → la confirmation crée le versement mais SAUTE le reçu (best-effort) :
  // on isole l'invariant financier, cœur de la régression.
  const m = await base.membre.create({
    data: { organisationId: ORG, nom: 'Djoumessi', prenom: 'Romel', anneeAdhesion: 2024 },
  })
  const c = await base.contribution.create({
    data: { organisationId: ORG, membreId: m.id, annee: 2025, montantAttendu: 12000 },
  })
  contributionId = c.id
  await base.parametrePaiement.create({
    data: {
      organisationId: ORG, provider: 'FAPSHI', actif: true,
      identifiantsChiffres: chiffrerSecret(
        JSON.stringify({ apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' }),
        ORG,
      ),
    },
  })
  await base.paiement.create({
    data: {
      organisationId: ORG, membreId: m.id, contributionId: c.id, montant: 12000,
      provider: 'FAPSHI', referenceExterne: TRANS_ID, statut: 'EN_ATTENTE',
    },
  })
  app = await buildApp({ psp, logger: false })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await nettoyer()
  await base.$disconnect()
})

describe('POST /webhooks/fapshi → confirmation (vraie base)', () => {
  it('REUSSI : crée UN versement, incrémente la contribution, marque le paiement REUSSI', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/fapshi', payload: { transId: TRANS_ID } })
    expect(res.statusCode).toBe(200)

    const paiement = await base.paiement.findFirst({ where: { referenceExterne: TRANS_ID } })
    expect(paiement?.statut).toBe('REUSSI')
    expect(paiement?.versementId).toBeTruthy()

    const versements = await base.versement.findMany({ where: { contributionId } })
    expect(versements).toHaveLength(1)
    expect(versements[0]?.montant).toBe(12000)
    expect(versements[0]?.idempotenceKey).toBe(TRANS_ID)

    const contribution = await base.contribution.findUnique({ where: { id: contributionId } })
    expect(contribution?.montantVerse).toBe(12000)
    expect(contribution?.montantValorise).toBe(12000)
  })

  it('rejeu du webhook → PAS de double versement (idempotence)', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/fapshi', payload: { transId: TRANS_ID } })
    expect(res.statusCode).toBe(200)

    const versements = await base.versement.findMany({ where: { contributionId } })
    expect(versements).toHaveLength(1) // toujours UN seul
    const contribution = await base.contribution.findUnique({ where: { id: contributionId } })
    expect(contribution?.montantVerse).toBe(12000) // pas de double-crédit
  })
})
