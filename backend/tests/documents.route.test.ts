import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildDocumentsMock, buildBlobMock, FICHIERS, MIME } from './support/documents-mocks'

/**
 * V2 (§5) — Documents : tests d'intégration (multipart, filtrage, suppression).
 * Prisma + Blob mockés. Entités parentes pré-alimentées (cf. documents-mocks).
 */

const BOUNDARY = '----nkoniTestBoundary'

/** Construit un corps multipart/form-data (champs texte + 1 fichier binaire). */
function multipart(fields: Record<string, string>, file?: { name: string; filename: string; mime: string; buffer: Buffer }): Buffer {
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
      ),
    )
    parts.push(file.buffer)
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`))
  return Buffer.concat(parts)
}

describe('Documents (§5) — routes', () => {
  let app: FastifyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let blob: ReturnType<typeof buildBlobMock>

  beforeEach(async () => {
    prisma = buildDocumentsMock()
    blob = buildBlobMock()
    app = await buildApp({ prisma, blob: blob.client, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub, role })}` })

  const post = (body: Buffer, role: string, sub: string) =>
    app.inject({
      method: 'POST',
      url: '/documents',
      headers: { ...auth(role, sub), 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    })

  const champs = (over: Record<string, string> = {}) => ({
    entiteType: 'COMMEMORATION',
    entiteId: 'cm-1',
    nom: 'acte.pdf',
    ...over,
  })
  const filePdf = { name: 'fichier', filename: 'acte.pdf', mime: MIME.pdf, buffer: FICHIERS.pdf }

  /* Upload ------------------------------------------------------------------ */

  it('POST /documents (SECRETAIRE, PDF, commémoration) → 201 + blob poussé, URL non exposée', async () => {
    const res = await post(multipart(champs(), filePdf), 'SECRETAIRE', 'u-sec')
    expect(res.statusCode).toBe(201)
    expect(blob.puts).toHaveLength(1)
    expect(res.json().url).toBeUndefined()
  })

  it('POST /documents type non autorisé (text) → 400, pas d’upload', async () => {
    const res = await post(
      multipart(champs(), { name: 'fichier', filename: 'note.txt', mime: MIME.texte, buffer: FICHIERS.texte }),
      'SECRETAIRE',
      'u-sec',
    )
    expect(res.statusCode).toBe(400)
    expect(blob.puts).toHaveLength(0)
  })

  it('POST /documents fichier > 10 Mo → 400', async () => {
    const gros = Buffer.concat([FICHIERS.pdf, Buffer.alloc(10 * 1024 * 1024 + 10)])
    const res = await post(multipart(champs(), { ...filePdf, buffer: gros }), 'SECRETAIRE', 'u-sec')
    expect(res.statusCode).toBe(400)
  })

  it('POST /documents sur un CONFLIT CONFIDENTIEL par un non-partie (SECRETAIRE) → 403', async () => {
    const res = await post(
      multipart(champs({ entiteType: 'CONFLIT', entiteId: 'cf-conf' }), filePdf),
      'SECRETAIRE',
      'u-sec',
    )
    expect(res.statusCode).toBe(403)
    expect(blob.puts).toHaveLength(0)
  })

  it('POST /documents par un MEMBRE_SIMPLE → 403', async () => {
    const res = await post(multipart(champs(), filePdf), 'MEMBRE_SIMPLE', 'u-membre')
    expect(res.statusCode).toBe(403)
  })

  /* Liste ------------------------------------------------------------------- */

  it('GET /documents : filtré par visibilité héritée (SECRETAIRE ne voit pas le doc du conflit confidentiel)', async () => {
    const dConf = prisma.__seedDoc({ entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    const dCommemo = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1' })
    const res = await app.inject({ method: 'GET', url: '/documents', headers: auth('SECRETAIRE', 'u-sec') })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((d: { id: string }) => d.id)
    expect(ids).toContain(dCommemo)
    expect(ids).not.toContain(dConf)
  })

  it('GET /documents?entiteType=CONFLIT&entiteId=cf-conf par un non-partie → liste vide', async () => {
    prisma.__seedDoc({ entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    const res = await app.inject({
      method: 'GET',
      url: '/documents?entiteType=CONFLIT&entiteId=cf-conf',
      headers: auth('SECRETAIRE', 'u-sec'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
  })

  it('GET /documents?entiteType=CONFLIT&entiteId=cf-conf par l’auteur → voit le doc', async () => {
    const dConf = prisma.__seedDoc({ entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    const res = await app.inject({
      method: 'GET',
      url: '/documents?entiteType=CONFLIT&entiteId=cf-conf',
      headers: auth('PRESIDENT', 'u-pres'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((d: { id: string }) => d.id)).toEqual([dConf])
  })

  /* Suppression ------------------------------------------------------------- */

  it('DELETE /documents/:id autorisé (SECRETAIRE) → 204 + blob supprimé', async () => {
    const id = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1', url: 'https://blob.test/z' })
    const res = await app.inject({ method: 'DELETE', url: `/documents/${id}`, headers: auth('SECRETAIRE', 'u-sec') })
    expect(res.statusCode).toBe(204)
    expect(blob.dels).toEqual(['https://blob.test/z'])
  })

  it('DELETE /documents/:id par un MEMBRE_SIMPLE → 403', async () => {
    const id = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1' })
    const res = await app.inject({ method: 'DELETE', url: `/documents/${id}`, headers: auth('MEMBRE_SIMPLE', 'u-membre') })
    expect(res.statusCode).toBe(403)
    expect(blob.dels).toHaveLength(0)
  })

  it('DELETE /documents/:id inexistant → 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/documents/inconnu', headers: auth('ADMIN', 'u-admin') })
    expect(res.statusCode).toBe(404)
  })
})
