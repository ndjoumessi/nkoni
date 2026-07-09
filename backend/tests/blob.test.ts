import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Client Blob RÉEL (`vercelBlobClient`) — store configuré en PRIVATE. On mocke `@vercel/blob`
 * pour prouver, sans réseau, que :
 *   - `put` écrit en `access: 'private'` (le store est privé → un `public` lèverait une erreur),
 *   - `lireContenu` lit via `get` en `access: 'private'` (lecture authentifiée par token) et
 *     bufferise le stream ; renvoie null si le blob est absent (get → null) ou non modifié (304),
 *   - `del` délègue la suppression par URL.
 */

const put = vi.fn()
const del = vi.fn()
const get = vi.fn()

vi.mock('@vercel/blob', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put: (...a: any[]) => put(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  del: (...a: any[]) => del(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (...a: any[]) => get(...a),
}))

const { vercelBlobClient } = await import('../src/lib/blob')

describe('vercelBlobClient — store PRIVÉ', () => {
  beforeEach(() => {
    put.mockReset()
    del.mockReset()
    get.mockReset()
  })

  it('put : access PRIVATE + contentType + addRandomSuffix, renvoie { url }', async () => {
    put.mockResolvedValue({ url: 'https://blob/x' })
    const r = await vercelBlobClient.put('documents/MEMBRE/m1/abc', Buffer.from('data'), {
      contentType: 'application/pdf',
    })
    expect(r).toEqual({ url: 'https://blob/x' })
    expect(put).toHaveBeenCalledWith('documents/MEMBRE/m1/abc', expect.any(Buffer), {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    })
  })

  it('lireContenu : get en access PRIVATE, bufferise le stream (200)', async () => {
    get.mockResolvedValue({
      statusCode: 200,
      stream: new Response('hello world').body,
      headers: new Headers(),
      blob: {},
    })
    const buf = await vercelBlobClient.lireContenu('https://blob/x')
    expect(get).toHaveBeenCalledWith('https://blob/x', { access: 'private' })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf?.toString()).toBe('hello world')
  })

  it('lireContenu : null si le blob est absent (get → null)', async () => {
    get.mockResolvedValue(null)
    expect(await vercelBlobClient.lireContenu('https://blob/x')).toBeNull()
  })

  it('lireContenu : null si non modifié (statusCode 304, stream null)', async () => {
    get.mockResolvedValue({ statusCode: 304, stream: null, headers: new Headers(), blob: {} })
    expect(await vercelBlobClient.lireContenu('https://blob/x')).toBeNull()
  })

  it('del : délègue à del(url)', async () => {
    del.mockResolvedValue(undefined)
    await vercelBlobClient.del('https://blob/x')
    expect(del).toHaveBeenCalledWith('https://blob/x')
  })
})
