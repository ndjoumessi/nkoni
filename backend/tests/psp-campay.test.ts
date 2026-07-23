import { describe, it, expect, vi, afterEach } from 'vitest'
import { campayClient, CampayTelephoneRequisError, CampayIdentifiantsRequisError } from '../src/lib/psp-campay'
import type { CredentialsPsp } from '../src/services/psp.service'

/** Identifiants CamPay par JETON PERMANENT (usage direct, sans passer par /token/). */
const credsSandbox: CredentialsPsp = { provider: 'CAMPAY', identifiants: { token: 'TK', environnement: 'SANDBOX' } }
const credsLive: CredentialsPsp = { provider: 'CAMPAY', identifiants: { token: 'TK', environnement: 'LIVE' } }

function reponseMock(reponse: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => reponse,
    text: async () => (typeof reponse === 'string' ? reponse : JSON.stringify(reponse)),
  } as unknown as Response
}

function mockFetch(reponse: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => reponseMock(reponse, ok, status))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('campayClient.initierCollecte (collecte directe)', () => {
  it('POST /collect/ (sandbox) : montant en chaîne, from = téléphone, external_reference, header Token', async () => {
    const fetchMock = mockFetch({ reference: 'CP-REF-1', ussd_code: '*126#', operator: 'MTN' })
    const res = await campayClient.initierCollecte(credsSandbox, {
      montant: 12000,
      reference: 'ext-1',
      description: 'Cotisation',
      telephone: '237699000000',
    })
    // Retour : la reference CamPay devient notre referenceExterne, PAS d'URL (collecte directe).
    expect(res).toEqual({ referenceExterne: 'CP-REF-1', statut: 'EN_ATTENTE' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://demo.campay.net/api/collect/')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Token TK')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      amount: '12000',
      currency: 'XAF',
      from: '237699000000',
      external_reference: 'ext-1',
    })
  })

  it('LIVE → base www.campay.net', async () => {
    const fetchMock = mockFetch({ reference: 'CP-REF-2' })
    await campayClient.initierCollecte(credsLive, { montant: 100, reference: 'e', description: 'd', telephone: '237699000000' })
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('https://www.campay.net/api/collect/')
  })

  it('username+password → échange /token/ puis collect avec le token obtenu', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(reponseMock({ token: 'TEMP-TK', expires_in: 3600 })) // POST /token/
      .mockResolvedValueOnce(reponseMock({ reference: 'CP-9' })) // POST /collect/
    vi.stubGlobal('fetch', fn)
    const creds: CredentialsPsp = {
      provider: 'CAMPAY',
      identifiants: { username: 'U', password: 'P', environnement: 'SANDBOX' },
    }
    const res = await campayClient.initierCollecte(creds, {
      montant: 100, reference: 'e', description: 'd', telephone: '237699000000',
    })
    expect(res).toEqual({ referenceExterne: 'CP-9', statut: 'EN_ATTENTE' })
    // 1er appel = /token/ (POST username+password)
    const [urlToken, initToken] = fn.mock.calls[0] as [string, RequestInit]
    expect(urlToken).toBe('https://demo.campay.net/api/token/')
    expect(JSON.parse(initToken.body as string)).toEqual({ username: 'U', password: 'P' })
    // 2e appel = /collect/ AVEC le token temporaire obtenu
    const [urlCollect, initCollect] = fn.mock.calls[1] as [string, RequestInit]
    expect(urlCollect).toBe('https://demo.campay.net/api/collect/')
    expect((initCollect.headers as Record<string, string>)['Authorization']).toBe('Token TEMP-TK')
  })

  it('ni token ni username/password → CampayIdentifiantsRequisError', async () => {
    const fetchMock = mockFetch({ reference: 'x' })
    const creds: CredentialsPsp = { provider: 'CAMPAY', identifiants: { environnement: 'SANDBOX' } }
    await expect(
      campayClient.initierCollecte(creds, { montant: 100, reference: 'e', description: 'd', telephone: '237699000000' }),
    ).rejects.toBeInstanceOf(CampayIdentifiantsRequisError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('échec d’échange /token/ → lève avec le corps de réponse', async () => {
    mockFetch({ detail: 'Invalid credentials' }, false, 400)
    const creds: CredentialsPsp = {
      provider: 'CAMPAY',
      identifiants: { username: 'U', password: 'bad', environnement: 'SANDBOX' },
    }
    await expect(
      campayClient.initierCollecte(creds, { montant: 100, reference: 'e', description: 'd', telephone: '237699000000' }),
    ).rejects.toThrow(/CamPay token 400 — .*Invalid credentials/)
  })

  it('sans téléphone → CampayTelephoneRequisError, AUCUN appel réseau', async () => {
    const fetchMock = mockFetch({ reference: 'x' })
    await expect(
      campayClient.initierCollecte(credsSandbox, { montant: 100, reference: 'e', description: 'd' }),
    ).rejects.toBeInstanceOf(CampayTelephoneRequisError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('réponse non-OK → lève (aucun Paiement fantôme en amont)', async () => {
    mockFetch({ message: 'bad' }, false, 400)
    await expect(
      campayClient.initierCollecte(credsSandbox, { montant: 100, reference: 'e', description: 'd', telephone: '237699000000' }),
    ).rejects.toThrow(/CamPay collect 400/)
  })

  it('reference manquante dans la réponse → lève', async () => {
    mockFetch({ ussd_code: '*126#' })
    await expect(
      campayClient.initierCollecte(credsSandbox, { montant: 100, reference: 'e', description: 'd', telephone: '237699000000' }),
    ).rejects.toThrow(/reference manquante/)
  })
})

describe('campayClient.verifierStatut', () => {
  it('GET /transaction/{ref}/ et mappe SUCCESSFUL → REUSSI', async () => {
    const fetchMock = mockFetch({ status: 'SUCCESSFUL' })
    const s = await campayClient.verifierStatut(credsSandbox, 'CP-REF-1')
    expect(s).toBe('REUSSI')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://demo.campay.net/api/transaction/CP-REF-1/')
  })
  it('FAILED → ECHEC', async () => {
    mockFetch({ status: 'FAILED' })
    expect(await campayClient.verifierStatut(credsSandbox, 'r')).toBe('ECHEC')
  })
  it('PENDING → EN_ATTENTE (on ne tranche pas à tort)', async () => {
    mockFetch({ status: 'PENDING' })
    expect(await campayClient.verifierStatut(credsSandbox, 'r')).toBe('EN_ATTENTE')
  })
  it('réponse non-OK → EN_ATTENTE (transitoire, jamais ECHEC sur une panne réseau)', async () => {
    mockFetch({}, false, 503)
    expect(await campayClient.verifierStatut(credsSandbox, 'r')).toBe('EN_ATTENTE')
  })
})
