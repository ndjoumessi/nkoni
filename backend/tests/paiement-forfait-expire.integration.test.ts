import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { chiffrerSecret } from '../src/lib/crypto-secret'
import { chargerCapacitesOrganisation } from '../src/services/capacites-organisation.service'
import type { PspClient } from '../src/services/psp.service'

/**
 * Invariant critique (spec 1.1 §3.3) : un paiement démarré avant l'expiration se confirme APRÈS — le
 * versement est créé même si l'organisation n'a plus droit au paiement en ligne.
 *
 * Exige une vraie Postgres (DATABASE_URL), `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, et
 * `PSP_ENCRYPTION_KEY` (posée ici pour chiffrer/déchiffrer la config PSP).
 */

const ORG = 'c0000000-0000-4000-8000-0000000000f8'
const TRANS_ID = 'TX-INTEGRATION-EXPIRE-1'

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
  await base.organisation.create({
    data: {
      id: ORG,
      nom: 'PaiementExpire',
      devise: 'FCFA',
      forfait: 'PRO',
      forfaitExpireLe: new Date(Date.now() - 40 * 86_400_000),
      paiementEnLigneAcquis: false,
    },
  })
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

describe('POST /webhooks/fapshi → confirmation malgré un forfait expiré (vraie base)', () => {
  it('REUSSI : crée UN versement, incrémente la contribution, marque le paiement REUSSI', async () => {
    const capacites = await chargerCapacitesOrganisation(base, ORG)
    expect(capacites?.paiementEnLigneInclus).toBe(false)

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
})
