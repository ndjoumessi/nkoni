import { describe, it, expect, beforeAll } from 'vitest'
import { reconcilierPaiementsToutesOrgs } from '../src/services/paiement-reconciliation.service'
import { chiffrerSecret } from '../src/lib/crypto-secret'
import type { PspClient, StatutPaiementResolu } from '../src/services/psp.service'

/**
 * Réconciliation au MOCK : on vérifie qu'elle itère org par org, re-sonde chaque `EN_ATTENTE` via le
 * PSP, et n'incrémente le compteur que sur une confirmation réelle. Le chemin REUSSI passe par une
 * `$transaction` mockée → couvre aussi `confirmerPaiement` sans base.
 */
beforeAll(() => {
  process.env['PSP_ENCRYPTION_KEY'] = Buffer.alloc(32, 3).toString('base64')
})

const ORG = 'o1'

function config() {
  return {
    provider: 'FAPSHI',
    actif: true,
    identifiantsChiffres: chiffrerSecret(JSON.stringify({ apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' }), ORG),
  }
}

function pspFige(statut: StatutPaiementResolu): PspClient {
  return {
    async initierCollecte() {
      return { referenceExterne: 'x', statut: 'EN_ATTENTE' }
    },
    async verifierStatut() {
      return statut
    },
    verifierSignatureWebhook() {
      return true
    },
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Prisma mocké pour UN paiement EN_ATTENTE dans l'org o1 (sans compte lié → pas de reçu). */
function prismaAvecUnPaiement(overrides: any = {}) {
  const paiement = {
    id: 'p1', organisationId: ORG, statut: 'EN_ATTENTE', referenceExterne: 'TX-1',
    montant: 1000, contributionId: 'c1', provider: 'FAPSHI', membre: { compteUtilisateurId: null },
  }
  return {
    organisation: { findMany: async () => [{ id: ORG }] },
    parametrePaiement: { findFirst: async () => config() },
    paiement: {
      findMany: async () => [{ id: 'p1' }],
      findFirst: async () => paiement,
      update: async () => ({}),
    },
    async $transaction(cb: any) {
      return cb({
        versement: { create: async ({ data }: any) => ({ id: 'v1', ...data }), findFirst: async () => null },
        contribution: { update: async () => ({}) },
        paiement: { update: async () => ({}) },
      })
    },
    ...overrides,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('reconcilierPaiementsToutesOrgs', () => {
  it('toujours EN_ATTENTE côté PSP → 0 confirmé, mais re-sondé', async () => {
    let sondes = 0
    const psp = pspFige('EN_ATTENTE')
    const pspCompte: PspClient = { ...psp, verifierStatut: async () => { sondes += 1; return 'EN_ATTENTE' } }
    const prisma = prismaAvecUnPaiement()
    const r = await reconcilierPaiementsToutesOrgs({ prisma, psp: pspCompte })
    expect(r).toEqual([{ organisationId: ORG, confirmes: 0 }])
    expect(sondes).toBe(1)
  })

  it('REUSSI côté PSP → 1 confirmé (versement créé via $transaction)', async () => {
    const prisma = prismaAvecUnPaiement()
    const r = await reconcilierPaiementsToutesOrgs({ prisma, psp: pspFige('REUSSI') })
    expect(r).toEqual([{ organisationId: ORG, confirmes: 1 }])
  })

  it('itère chaque organisation active dans son propre contexte', async () => {
    const vues: string[] = []
    const prisma = {
      organisation: { findMany: async () => [{ id: 'o1' }, { id: 'o2' }] },
      paiement: {
        findMany: async () => { return [] }, // aucune EN_ATTENTE → pas de confirmation
      },
    }
    // On instrumente findMany pour tracer l'ordre (le contexte org est posé par run()).
    const prismaTrace = {
      ...prisma,
      paiement: { findMany: async () => { vues.push('scan'); return [] } },
    }
    const r = await reconcilierPaiementsToutesOrgs({ prisma: prismaTrace, psp: pspFige('EN_ATTENTE') })
    expect(r.map((x) => x.organisationId)).toEqual(['o1', 'o2'])
    expect(vues).toHaveLength(2)
  })
})
