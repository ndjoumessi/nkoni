import { describe, it, expect, beforeAll } from 'vitest'
import { lireConfigPaiement, enregistrerConfigPaiement } from '../src/services/parametre-paiement.service'
import { dechiffrerSecret } from '../src/lib/crypto-secret'

/**
 * Config paiement au MOCK (surface Prisma factice) — teste le cœur SANS base ni client régénéré :
 * chiffrement des identifiants, NON-fuite du secret dans la vue, create vs update.
 */
beforeAll(() => {
  process.env['PSP_ENCRYPTION_KEY'] = Buffer.alloc(32, 9).toString('base64')
})

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockPrisma(initial: any = null) {
  let row = initial
  return {
    ligne: () => row,
    parametrePaiement: {
      findFirst: async () => row,
      create: async ({ data }: any) => {
        row = { id: 'pp1', organisationId: 'org', ...data }
        return row
      },
      update: async ({ data }: any) => {
        row = { ...row, ...data }
        return row
      },
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('config paiement (service)', () => {
  it('lecture sans config → configure=false', async () => {
    const p = mockPrisma(null)
    expect(await lireConfigPaiement(p as never)).toEqual({
      configure: false, provider: null, environnement: null, actif: false,
    })
  })

  it('enregistrement (create) : chiffre le secret et ne l’expose JAMAIS dans la vue', async () => {
    const p = mockPrisma(null)
    const vue = await enregistrerConfigPaiement(p as never, {
      provider: 'FAPSHI',
      identifiants: { apiUser: 'u', apiKey: 'SECRET-KEY', environnement: 'SANDBOX' },
      actif: true,
    })
    expect(vue).toEqual({ configure: true, provider: 'FAPSHI', environnement: 'SANDBOX', actif: true })
    expect(JSON.stringify(vue)).not.toContain('SECRET-KEY')
    // Stockage chiffré : le secret n'apparaît pas en clair, mais reste déchiffrable côté serveur.
    const stocke = p.ligne().identifiantsChiffres
    expect(stocke).not.toContain('SECRET-KEY')
    expect(JSON.parse(dechiffrerSecret(stocke)).apiKey).toBe('SECRET-KEY')
  })

  it('identifiants invalides → lève (IdentifiantsInvalidesError)', async () => {
    const p = mockPrisma(null)
    await expect(
      enregistrerConfigPaiement(p as never, { provider: 'FAPSHI', identifiants: { apiUser: 'u' }, actif: true }),
    ).rejects.toThrow()
  })

  it('enregistrement (update) quand une config existe déjà', async () => {
    const p = mockPrisma({ id: 'pp1', organisationId: 'org', provider: 'FAPSHI', identifiantsChiffres: 'x', actif: false })
    const vue = await enregistrerConfigPaiement(p as never, {
      provider: 'CAMPAY', identifiants: { token: 'TOK' }, actif: true,
    })
    expect(vue.provider).toBe('CAMPAY')
    expect(vue.actif).toBe(true)
  })
})
