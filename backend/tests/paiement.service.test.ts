import { describe, it, expect, beforeAll } from 'vitest'
import {
  prochaineAction,
  demarrerPaiement,
  ConfigPaiementIndisponibleError,
  MontantInvalideError,
  ContributionIntrouvableError,
} from '../src/services/paiement.service'
import { chiffrerSecret } from '../src/lib/crypto-secret'
import type { PspClient } from '../src/services/psp.service'

beforeAll(() => {
  process.env['PSP_ENCRYPTION_KEY'] = Buffer.alloc(32, 5).toString('base64')
})

const ORG = 'org-1'

describe('prochaineAction (décision pure, idempotente)', () => {
  it('EN_ATTENTE + REUSSI → CREER_VERSEMENT', () => {
    expect(prochaineAction('EN_ATTENTE', 'REUSSI')).toBe('CREER_VERSEMENT')
  })
  it('EN_ATTENTE + ECHEC → MARQUER_ECHEC', () => {
    expect(prochaineAction('EN_ATTENTE', 'ECHEC')).toBe('MARQUER_ECHEC')
  })
  it('EN_ATTENTE + EXPIRE → MARQUER_EXPIRE', () => {
    expect(prochaineAction('EN_ATTENTE', 'EXPIRE')).toBe('MARQUER_EXPIRE')
  })
  it('EN_ATTENTE + EN_ATTENTE → RIEN', () => {
    expect(prochaineAction('EN_ATTENTE', 'EN_ATTENTE')).toBe('RIEN')
  })
  it('déjà REUSSI → RIEN quel que soit le statut résolu (idempotence)', () => {
    expect(prochaineAction('REUSSI', 'REUSSI')).toBe('RIEN')
    expect(prochaineAction('REUSSI', 'ECHEC')).toBe('RIEN')
  })
})

/** Config chiffrée valide pour l'org (Fapshi sandbox). */
function configFapshi() {
  return {
    provider: 'FAPSHI',
    actif: true,
    identifiantsChiffres: chiffrerSecret(
      JSON.stringify({ apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' }),
      ORG,
    ),
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function pspStub(): PspClient & { appels: any[] } {
  const appels: any[] = []
  return {
    appels,
    async initierCollecte(creds, demande) {
      appels.push({ creds, demande })
      return { referenceExterne: 'TX-1', urlPaiement: 'https://pay/x', statut: 'EN_ATTENTE' }
    },
    async verifierStatut() {
      return 'EN_ATTENTE'
    },
    verifierSignatureWebhook() {
      return true
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('demarrerPaiement', () => {
  const base = { organisationId: ORG, membreId: 'm1', contributionId: 'c1', montant: 12000, description: 'Cotisation' }

  it('montant < 100 → MontantInvalideError (avant tout appel PSP)', async () => {
    const psp = pspStub()
    const prisma = { parametrePaiement: { findFirst: async () => configFapshi() } }
    await expect(demarrerPaiement({ prisma, psp }, { ...base, montant: 50 })).rejects.toBeInstanceOf(MontantInvalideError)
    expect(psp.appels).toHaveLength(0)
  })

  it('config absente ou inactive → ConfigPaiementIndisponibleError', async () => {
    const psp = pspStub()
    const prismaAbsente = { parametrePaiement: { findFirst: async () => null } }
    await expect(demarrerPaiement({ prisma: prismaAbsente, psp }, base)).rejects.toBeInstanceOf(ConfigPaiementIndisponibleError)
    const prismaInactive = { parametrePaiement: { findFirst: async () => ({ ...configFapshi(), actif: false }) } }
    await expect(demarrerPaiement({ prisma: prismaInactive, psp }, base)).rejects.toBeInstanceOf(ConfigPaiementIndisponibleError)
  })

  it('contribution qui n’appartient pas au membre → ContributionIntrouvableError', async () => {
    const psp = pspStub()
    const prisma = {
      parametrePaiement: { findFirst: async () => configFapshi() },
      contribution: { findFirst: async () => null },
    }
    await expect(demarrerPaiement({ prisma, psp }, base)).rejects.toBeInstanceOf(ContributionIntrouvableError)
    expect(psp.appels).toHaveLength(0)
  })

  it('happy path : déchiffre, appelle le PSP, crée le Paiement, renvoie l’URL', async () => {
    const psp = pspStub()
    let cree: any = null
    const prisma = {
      parametrePaiement: { findFirst: async () => configFapshi() },
      contribution: { findFirst: async () => ({ id: 'c1' }) },
      paiement: { create: async ({ data }: any) => { cree = data; return { id: 'p1', ...data } } },
    }
    const r = await demarrerPaiement({ prisma, psp }, base)
    expect(r).toEqual({ paiementId: 'p1', urlPaiement: 'https://pay/x' })
    // Le PSP a reçu les identifiants DÉCHIFFRÉS de l'org.
    expect(psp.appels[0].creds.identifiants.apiKey).toBe('K')
    expect(psp.appels[0].demande.montant).toBe(12000)
    // Le Paiement est tracé EN_ATTENTE avec le transId du PSP.
    expect(cree.referenceExterne).toBe('TX-1')
    expect(cree.statut).toBe('EN_ATTENTE')
  })
})
