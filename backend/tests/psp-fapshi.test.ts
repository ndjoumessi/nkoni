import { describe, it, expect, vi, afterEach } from 'vitest'
import { fapshiClient } from '../src/lib/psp-fapshi'

/**
 * Adapter Fapshi — testé avec `fetch` stubé (aucun réseau). On vérifie la construction de la requête
 * (base URL selon l'environnement, en-têtes apiuser/apikey, mapping de nos champs → ceux de Fapshi) et
 * le mapping des statuts. Le round-trip réel contre le sandbox reste à faire avec de vraies clés.
 */

const creds = {
  provider: 'FAPSHI' as const,
  identifiants: { apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubFetch(impl: (url: string, init?: any) => any) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('fapshiClient.initierCollecte', () => {
  it('POST /initiate-pay (SANDBOX) : en-têtes apiuser/apikey + externalId=référence + montant', async () => {
    let url = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let init: any = null
    stubFetch((u, i) => {
      url = u
      init = i
      return { ok: true, json: async () => ({ transId: 'TX1', link: 'https://pay/x' }) }
    })
    const r = await fapshiClient.initierCollecte(creds, {
      montant: 12000,
      reference: 'p1',
      description: 'Cotisation 2026',
      redirectUrl: 'https://back',
    })
    expect(url).toBe('https://sandbox.fapshi.com/initiate-pay')
    expect(init.method).toBe('POST')
    expect(init.headers.apiuser).toBe('U')
    expect(init.headers.apikey).toBe('K')
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 12000,
      externalId: 'p1',
      message: 'Cotisation 2026',
      redirectUrl: 'https://back',
    })
    expect(r).toEqual({ referenceExterne: 'TX1', urlPaiement: 'https://pay/x', statut: 'EN_ATTENTE' })
  })

  it('LIVE → base live.fapshi.com', async () => {
    let url = ''
    stubFetch((u) => {
      url = u
      return { ok: true, json: async () => ({ transId: 'T' }) }
    })
    await fapshiClient.initierCollecte(
      { ...creds, identifiants: { ...creds.identifiants, environnement: 'LIVE' } },
      { montant: 100, reference: 'p', description: 'x' },
    )
    expect(url).toBe('https://live.fapshi.com/initiate-pay')
  })

  it('HTTP non-ok → lève (pas de faux EN_ATTENTE)', async () => {
    stubFetch(() => ({ ok: false, status: 400, json: async () => ({}) }))
    await expect(
      fapshiClient.initierCollecte(creds, { montant: 100, reference: 'p', description: 'x' }),
    ).rejects.toThrow()
  })

  it('transId manquant → lève', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ link: 'x' }) }))
    await expect(
      fapshiClient.initierCollecte(creds, { montant: 100, reference: 'p', description: 'x' }),
    ).rejects.toThrow()
  })
})

describe('fapshiClient.verifierStatut', () => {
  it.each([
    ['SUCCESSFUL', 'REUSSI'],
    ['FAILED', 'ECHEC'],
    ['EXPIRED', 'EXPIRE'],
    ['CREATED', 'EN_ATTENTE'],
    ['PENDING', 'EN_ATTENTE'],
  ])('mappe %s → %s', async (fapshi, attendu) => {
    stubFetch(() => ({ ok: true, json: async () => ({ status: fapshi }) }))
    expect(await fapshiClient.verifierStatut(creds, 'TX1')).toBe(attendu)
  })

  it('erreur réseau (non-ok) → EN_ATTENTE (ne jamais conclure à tort)', async () => {
    stubFetch(() => ({ ok: false, status: 500, json: async () => ({}) }))
    expect(await fapshiClient.verifierStatut(creds, 'TX1')).toBe('EN_ATTENTE')
  })

  it('GET /payment-status/{transId} avec transId encodé', async () => {
    let url = ''
    stubFetch((u) => {
      url = u
      return { ok: true, json: async () => ({ status: 'CREATED' }) }
    })
    await fapshiClient.verifierStatut(creds, 'a/b')
    expect(url).toBe('https://sandbox.fapshi.com/payment-status/a%2Fb')
  })
})
