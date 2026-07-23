import { describe, it, expect, vi, afterEach } from 'vitest'
import { pspRegistry } from '../src/lib/psp-registry'
import type { CredentialsPsp } from '../src/services/psp.service'

/**
 * Le dispatcher route par `creds.provider`. On mocke les DEUX adaptateurs et on vérifie que seul celui
 * du provider des creds est appelé — le cœur métier ne connaît que l'interface, la sélection est ici.
 */
const initFapshi = vi.fn(async () => ({ referenceExterne: 'F', statut: 'EN_ATTENTE' as const }))
const initCampay = vi.fn(async () => ({ referenceExterne: 'C', statut: 'EN_ATTENTE' as const }))

vi.mock('../src/lib/psp-fapshi', () => ({
  fapshiClient: {
    initierCollecte: (...a: unknown[]) => initFapshi(...(a as [])),
    verifierStatut: async () => 'EN_ATTENTE',
    verifierSignatureWebhook: () => true,
  },
}))
vi.mock('../src/lib/psp-campay', () => ({
  campayClient: {
    initierCollecte: (...a: unknown[]) => initCampay(...(a as [])),
    verifierStatut: async () => 'EN_ATTENTE',
    verifierSignatureWebhook: () => false,
  },
}))

afterEach(() => vi.clearAllMocks())

const demande = { montant: 100, reference: 'r', description: 'd' }

describe('pspRegistry (dispatch par provider)', () => {
  it('provider FAPSHI → adaptateur Fapshi seul', async () => {
    const creds: CredentialsPsp = { provider: 'FAPSHI', identifiants: {} }
    const r = await pspRegistry.initierCollecte(creds, demande)
    expect(r.referenceExterne).toBe('F')
    expect(initFapshi).toHaveBeenCalledOnce()
    expect(initCampay).not.toHaveBeenCalled()
  })

  it('provider CAMPAY → adaptateur CamPay seul', async () => {
    const creds: CredentialsPsp = { provider: 'CAMPAY', identifiants: {} }
    const r = await pspRegistry.initierCollecte(creds, demande)
    expect(r.referenceExterne).toBe('C')
    expect(initCampay).toHaveBeenCalledOnce()
    expect(initFapshi).not.toHaveBeenCalled()
  })

  it('verifierSignatureWebhook suit aussi le provider', () => {
    expect(pspRegistry.verifierSignatureWebhook({ provider: 'FAPSHI', identifiants: {} }, '', undefined)).toBe(true)
    expect(pspRegistry.verifierSignatureWebhook({ provider: 'CAMPAY', identifiants: {} }, '', undefined)).toBe(false)
  })
})
