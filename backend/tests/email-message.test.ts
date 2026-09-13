import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envoyerMessageEmail, vraiEmailClient } from '../src/services/email.service'

/** Message e-mail SANS pièce jointe (relances d'échéance, spec 1.1 §4.1) — best-effort, ne lève jamais. */

describe('vraiEmailClient.envoyerMessage', () => {
  const envInitial = { cle: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM }
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM = 'NKONI <noreply@exemple.test>'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (envInitial.cle === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = envInitial.cle
    if (envInitial.from === undefined) delete process.env.RESEND_FROM
    else process.env.RESEND_FROM = envInitial.from
  })

  it('POST Resend avec sujet et texte, sans pièce jointe', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await vraiEmailClient.envoyerMessage('a@exemple.test', 'Sujet', 'Texte')
    expect(r).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({
      from: 'NKONI <noreply@exemple.test>',
      to: ['a@exemple.test'],
      subject: 'Sujet',
      text: 'Texte',
    })
  })

  it('sans configuration → { ok: false }, aucun appel réseau', async () => {
    delete process.env.RESEND_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await vraiEmailClient.envoyerMessage('a@exemple.test', 'S', 'T')).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('réseau qui lève → { ok: false }, aucune exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau') }))
    expect(await vraiEmailClient.envoyerMessage('a@exemple.test', 'S', 'T')).toEqual({ ok: false })
  })
})

describe('envoyerMessageEmail', () => {
  const client = (ok = true, dispo = true) => ({
    disponible: () => dispo,
    envoyerDocument: vi.fn(async () => ({ ok })),
    envoyerMessage: vi.fn(async () => ({ ok })),
  })

  it('adresse normalisée transmise, true si délivré', async () => {
    const c = client()
    expect(await envoyerMessageEmail(c, '  Bureau@Exemple.TEST ', 'S', 'T')).toBe(true)
    expect(c.envoyerMessage).toHaveBeenCalledWith('bureau@exemple.test', 'S', 'T')
  })

  it('adresse absente ou invalide, ou client indisponible → false sans appel', async () => {
    const c = client()
    expect(await envoyerMessageEmail(c, null, 'S', 'T')).toBe(false)
    expect(await envoyerMessageEmail(c, 'pas-un-email', 'S', 'T')).toBe(false)
    expect(await envoyerMessageEmail(client(true, false), 'a@exemple.test', 'S', 'T')).toBe(false)
    expect(c.envoyerMessage).not.toHaveBeenCalled()
  })

  it('client qui lève → false, aucune exception', async () => {
    const c = { disponible: () => true, envoyerDocument: vi.fn(), envoyerMessage: async () => { throw new Error('x') } }
    expect(await envoyerMessageEmail(c, 'a@exemple.test', 'S', 'T')).toBe(false)
  })
})
