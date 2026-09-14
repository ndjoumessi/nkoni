/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildBlobMock, buildDocumentsMock, FICHIERS, MIME } from './support/documents-mocks'

/**
 * Quota de stockage (spec 1.1 §3.3) sur POST /documents — refus 403 AVANT tout envoi au Blob, message
 * « utilisé sur quota ». Prisma et Blob mockés ; l'aggregate SCOPÉ réel est prouvé en intégration.
 */

const BOUNDARY = '----nkoniTestBoundary'
const MO = 1024 * 1024

function multipart(fields: Record<string, string>, file: { name: string; filename: string; mime: string; buffer: Buffer }): Buffer {
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
  )
  parts.push(file.buffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`))
  return Buffer.concat(parts)
}

describe('POST /documents — quota de stockage', () => {
  let app: FastifyInstance
  let blob: ReturnType<typeof buildBlobMock>

  async function demarrer(sommeOctets: number) {
    const prisma: any = buildDocumentsMock()
    prisma.organisation = {
      findUnique: async () => ({ forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }),
    }
    prisma.document.aggregate = async () => ({ _sum: { tailleOctets: sommeOctets } })
    blob = buildBlobMock()
    app = await buildApp({ prisma, blob: blob.client, logger: false })
    await app.ready()
  }
  afterEach(async () => {
    await app?.close()
  })

  const envoyer = () =>
    app.inject({
      method: 'POST',
      url: '/documents',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: 'u-sec', role: 'SECRETAIRE', organisationId: 'org-1' })}`,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      payload: multipart(
        { entiteType: 'COMMEMORATION', entiteId: 'cm-1', nom: 'acte.pdf' },
        { name: 'fichier', filename: 'acte.pdf', mime: MIME.pdf, buffer: FICHIERS.pdf },
      ),
    })

  it('quota atteint → 403 avec utilisé et quota, aucun envoi au Blob', async () => {
    await demarrer(500 * MO)
    const res = await envoyer()
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('500 Mo sur 500 Mo')
    expect(blob.puts).toHaveLength(0)
  })

  it('sous le quota → 201, comportement nominal inchangé', async () => {
    await demarrer(0)
    const res = await envoyer()
    expect(res.statusCode).toBe(201)
    expect(blob.puts).toHaveLength(1)
  })
})
