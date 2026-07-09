import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { tenantExtension } from '../src/lib/tenant-extension'
import { orgContext } from '../src/lib/org-context'
import {
  televerserDocument,
  type BlobClient,
  type DemandeurDocument,
} from '../src/services/document.service'

/**
 * RÉGRESSION (§2.2/§5) — création d'un Document via le client SCOPÉ, contre une VRAIE base.
 *
 * Bug corrigé (fix/document-create-scalaire) : `televerserDocument` écrivait `televersePar:
 * { connect }` (forme RELATION → input « checked ») pendant que l'extension d'isolation injecte
 * le SCALAIRE `organisationId` (valide seulement en input « unchecked »). Le mélange faisait
 * échouer Prisma : « Argument `organisation` is missing ». Le fix passe en FK scalaire
 * `televerseParId`, comme tous les autres creates scopés.
 *
 * Ce test ne peut PAS être mocké : c'est la validation runtime de Prisma (relation vs scalaire)
 * qui déclenche le bug → il faut une vraie base.
 */

const ORG = 'c0000000-0000-4000-8000-0000000000d1'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const base = new PrismaClient({ adapter })
const client = base.$extends(tenantExtension(base)) as unknown as PrismaClient

let uploaderId = ''
let membreId = ''

/** Blob factice : l'upload réel n'est pas le sujet ici (c'est l'écriture DB scopée). */
const blob: BlobClient = {
  put: async () => ({ url: 'https://blob.test/doc' }),
  del: async () => {},
  lireContenu: async () => null,
}
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4

async function nettoyer(): Promise<void> {
  await base.document.deleteMany({ where: { organisationId: ORG } })
  await base.membre.deleteMany({ where: { organisationId: ORG } })
  await base.utilisateur.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({ data: { id: ORG, nom: 'OrgDoc', devise: 'FCFA' } })
  const u = await base.utilisateur.create({
    data: { organisationId: ORG, email: `up-${ORG}@test.local`, passwordHash: 'x', role: 'ADMIN' },
  })
  uploaderId = u.id
  const m = await base.membre.create({
    data: { organisationId: ORG, nom: 'Doc', prenom: 'Parent', anneeAdhesion: 2020 },
  })
  membreId = m.id
})

afterAll(async () => {
  await nettoyer()
  await base.$disconnect()
})

function enOrg<T>(fn: () => Promise<T>): Promise<T> {
  return orgContext.run({ organisationId: ORG }, async () => await fn())
}

describe('Document.create scopé — forme scalaire + injection organisationId', () => {
  const uploader: DemandeurDocument = { id: '', role: 'ADMIN' }

  it('televerserDocument : crée le document (plus de « organisation is missing »)', async () => {
    uploader.id = uploaderId
    const doc = await enOrg(() =>
      televerserDocument(
        client as never,
        blob,
        {
          nom: 'acte.pdf',
          entiteType: 'MEMBRE',
          entiteId: membreId,
          fichier: { buffer: PDF, mimetype: 'application/pdf' },
        },
        uploader,
      ),
    )
    expect(doc.id).toBeTruthy()
    expect(doc.nom).toBe('acte.pdf')

    // Vérif en base NON scopée : la ligne porte bien l'org courante (injectée) et le bon uploader.
    const enBase = await base.document.findUnique({ where: { id: doc.id } })
    expect(enBase?.organisationId).toBe(ORG)
    expect(enBase?.televerseParId).toBe(uploaderId)
  })

  it('create scalaire direct : l’extension injecte organisationId', async () => {
    const doc = await enOrg(() =>
      client.document.create({
        data: {
          nom: 'b.pdf',
          url: 'https://blob.test/b',
          typeFichier: 'application/pdf',
          tailleOctets: 8,
          entiteType: 'MEMBRE',
          entiteId: membreId,
          televerseParId: uploaderId,
        },
        select: { id: true, organisationId: true, televerseParId: true },
      }),
    )
    expect(doc.organisationId).toBe(ORG)
    expect(doc.televerseParId).toBe(uploaderId)
  })

  it('GARDE : la forme relation (televersePar.connect) + injection scalaire → erreur Prisma', async () => {
    // Documente POURQUOI on écrit en scalaire : cette forme rebasculerait le bug d'origine.
    await expect(
      enOrg(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).document.create({
          data: {
            nom: 'c.pdf',
            url: 'https://blob.test/c',
            typeFichier: 'application/pdf',
            tailleOctets: 8,
            entiteType: 'MEMBRE',
            entiteId: membreId,
            televersePar: { connect: { id: uploaderId } },
          },
        }),
      ),
    ).rejects.toThrow(/organisation/i)
  })
})
