import { describe, it, expect } from 'vitest'
import { validerIdentifiants, pspMock } from '../src/services/psp.service'

describe('validerIdentifiants', () => {
  it('FAPSHI complet → null', () => {
    expect(validerIdentifiants('FAPSHI', { apiUser: 'u', apiKey: 'k', environnement: 'SANDBOX' })).toBeNull()
  })
  it('FAPSHI sans apiKey → IDENTIFIANTS_INCOMPLETS', () => {
    expect(validerIdentifiants('FAPSHI', { apiUser: 'u', environnement: 'SANDBOX' })).toBe('IDENTIFIANTS_INCOMPLETS')
  })
  it('FAPSHI environnement invalide → ENVIRONNEMENT_INVALIDE', () => {
    expect(validerIdentifiants('FAPSHI', { apiUser: 'u', apiKey: 'k', environnement: 'PROD' })).toBe('ENVIRONNEMENT_INVALIDE')
  })
  it('CAMPAY sans identifiants → IDENTIFIANTS_INCOMPLETS', () => {
    expect(validerIdentifiants('CAMPAY', {})).toBe('IDENTIFIANTS_INCOMPLETS')
  })
  it('CAMPAY par username + password + environnement → null', () => {
    expect(validerIdentifiants('CAMPAY', { username: 'u', password: 'p', environnement: 'SANDBOX' })).toBeNull()
  })
  it('CAMPAY par jeton permanent + environnement → null', () => {
    expect(validerIdentifiants('CAMPAY', { token: 'T', environnement: 'LIVE' })).toBeNull()
  })
  it('CAMPAY username sans password → IDENTIFIANTS_INCOMPLETS', () => {
    expect(validerIdentifiants('CAMPAY', { username: 'u', environnement: 'SANDBOX' })).toBe('IDENTIFIANTS_INCOMPLETS')
  })
  it('CAMPAY identifiants OK mais environnement invalide → ENVIRONNEMENT_INVALIDE', () => {
    expect(validerIdentifiants('CAMPAY', { token: 'T', environnement: 'PROD' })).toBe('ENVIRONNEMENT_INVALIDE')
  })
})

describe('pspMock (inerte)', () => {
  it('initierCollecte → EN_ATTENTE + référence dérivée de la nôtre', async () => {
    const r = await pspMock.initierCollecte(
      { provider: 'FAPSHI', identifiants: {} },
      { montant: 12000, telephone: '237600000000', reference: 'p1', description: 'Cotisation' },
    )
    expect(r.statut).toBe('EN_ATTENTE')
    expect(r.referenceExterne).toContain('p1')
  })
  it('verifierSignatureWebhook refuse par défaut (fail-closed)', () => {
    expect(pspMock.verifierSignatureWebhook({ provider: 'FAPSHI', identifiants: {} }, '{}', undefined)).toBe(false)
  })
})
