import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * RÉGRESSION (spec 1.1 §3.3) — quota de stockage sur `POST /documents`, contre une VRAIE Postgres.
 *
 * Ce test ne peut PAS être mocké : (1) l'`aggregate` `Σ tailleOctets` doit être prouvé SCOPÉ par
 * l'extension tenant (documents d'une autre organisation exclus du calcul — un mock d'aggregate ne
 * filtre jamais par le `where` injecté) ; (2) la somme au-delà d'un entier 32 bits (scénario 3, PRO)
 * n'est vérifiable que par le comportement réel de Prisma/Postgres sur `SUM(Int)`.
 */

const ORG_A = 'f1000000-0000-4000-8000-00000000a001'
const ORG_B = 'f1000000-0000-4000-8000-00000000b001'
const ORG_C = 'f1000000-0000-4000-8000-00000000c001'

const EMAIL_A = 'admin@quota-doc-it-a.local'
const EMAIL_B = 'admin@quota-doc-it-b.local'
const EMAIL_C = 'admin@quota-doc-it-c.local'
const PASSWORD = 'secret-quota-doc-123'

const MO = 1024 * 1024
const GO = 1024 * MO

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance
const jetons: Record<string, string> = {}

const BOUNDARY = '----nkoniQuotaItBoundary'
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4

/** Construit un buffer PDF valide (magic bytes) de la taille approximative demandée. */
function fichierPdf(octets: number): Buffer {
  const remplissage = Buffer.alloc(Math.max(0, octets - PDF_MAGIC.length), 0x20)
  return Buffer.concat([PDF_MAGIC, remplissage])
}

function multipart(
  fields: Record<string, string>,
  file: { name: string; filename: string; mime: string; buffer: Buffer },
): Buffer {
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

async function envoyerDocument(orgKey: string, entiteId: string, octets: number) {
  return app.inject({
    method: 'POST',
    url: '/documents',
    headers: {
      authorization: `Bearer ${jetons[orgKey]}`,
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    },
    payload: multipart(
      { entiteType: 'COMMEMORATION', entiteId, nom: 'piece.pdf' },
      { name: 'fichier', filename: 'piece.pdf', mime: 'application/pdf', buffer: fichierPdf(octets) },
    ),
  })
}

async function nettoyer(): Promise<void> {
  for (const org of [ORG_A, ORG_B, ORG_C]) {
    await base.document.deleteMany({ where: { organisationId: org } })
    await base.commemoration.deleteMany({ where: { organisationId: org } })
    const comptes = await base.utilisateur.findMany({ where: { organisationId: org }, select: { id: true } })
    await base.refreshToken.deleteMany({ where: { utilisateurId: { in: comptes.map((c) => c.id) } } })
    await base.utilisateur.deleteMany({ where: { organisationId: org } })
    await base.organisation.deleteMany({ where: { id: org } })
  }
}

async function creerOrg(id: string, nom: string, email: string): Promise<{ commemorationId: string; adminId: string }> {
  await base.organisation.create({ data: { id, nom, devise: 'FCFA' } })
  const u = await base.utilisateur.create({
    data: { organisationId: id, email, passwordHash: await hashPassword(PASSWORD), role: 'ADMIN' },
  })
  const c = await base.commemoration.create({
    data: { organisationId: id, titre: 'Commémoration IT', date: new Date() },
  })
  return { commemorationId: c.id, adminId: u.id }
}

let commemorationA = ''
let commemorationB = ''
let commemorationC = ''

beforeAll(async () => {
  await nettoyer()
  const a = await creerOrg(ORG_A, 'Quota Doc IT A', EMAIL_A)
  const b = await creerOrg(ORG_B, 'Quota Doc IT B', EMAIL_B)
  const c = await creerOrg(ORG_C, 'Quota Doc IT C', EMAIL_C)
  commemorationA = a.commemorationId
  commemorationB = b.commemorationId
  commemorationC = c.commemorationId

  app = await buildApp({
    logger: false,
    blob: {
      put: async (pathname: string) => ({ url: `https://blob.test/${pathname}` }),
      del: async () => {},
      lireContenu: async () => null,
    },
  })

  for (const [key, email] of [
    ['A', EMAIL_A],
    ['B', EMAIL_B],
    ['C', EMAIL_C],
  ] as const) {
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })
    jetons[key] = login.json().accessToken
    expect(jetons[key]).toBeTruthy()
  }
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

describe('POST /documents — quota de stockage (intégration, vraie Postgres)', () => {
  it('Org A GRATUIT à 499 Mo : un envoi de 2 Mo dépasse le quota → 403, rien n’est créé', async () => {
    await base.document.create({
      data: {
        organisationId: ORG_A,
        nom: 'existant.pdf',
        url: 'https://blob.test/seed/a',
        typeFichier: 'application/pdf',
        tailleOctets: 499 * MO,
        entiteType: 'COMMEMORATION',
        entiteId: commemorationA,
        televerseParId: (await base.utilisateur.findFirstOrThrow({ where: { organisationId: ORG_A } })).id,
      },
    })
    const avant = await base.document.count({ where: { organisationId: ORG_A } })

    const res = await envoyerDocument('A', commemorationA, 2 * MO)

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('499 Mo')
    expect(res.json().message).toContain('500 Mo')
    expect(await base.document.count({ where: { organisationId: ORG_A } })).toBe(avant)
  })

  it('Org B GRATUIT vide, à côté des 499 Mo de A : le même envoi passe → 201 (aggregate SCOPÉ)', async () => {
    const res = await envoyerDocument('B', commemorationB, 2 * MO)

    expect(res.statusCode).toBe(201)
    expect(await base.document.count({ where: { organisationId: ORG_B } })).toBe(1)
  })

  it('Org C PRO sans échéance, 11 lignes ≈ 20,5 Go (somme > 2^31) : envoi refusé → 403 (quota Pro 20 Go)', async () => {
    await base.organisation.update({ where: { id: ORG_C }, data: { forfait: 'PRO', forfaitExpireLe: null } })
    const televerseParId = (await base.utilisateur.findFirstOrThrow({ where: { organisationId: ORG_C } })).id
    await base.document.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({
        organisationId: ORG_C,
        nom: `gros-${i}.pdf`,
        url: `https://blob.test/seed/c-${i}`,
        typeFichier: 'application/pdf',
        tailleOctets: 2_000_000_000,
        entiteType: 'COMMEMORATION' as const,
        entiteId: commemorationC,
        televerseParId,
      })),
    })
    // Somme réelle : 11 × 2 000 000 000 = 22 000 000 000 octets (> 2^31 = 2 147 483 648).
    expect(22_000_000_000).toBeGreaterThan(2 ** 31)
    expect(20 * GO).toBeLessThan(22_000_000_000)

    const res = await envoyerDocument('C', commemorationC, 1 * MO)

    expect(res.statusCode).toBe(403)
  })

  it('Org C repassée en PRO EXPIRÉ (au-delà de la grâce), 600 Mo seulement : quota Gratuit effectif → 403', async () => {
    await base.document.deleteMany({ where: { organisationId: ORG_C } })
    const televerseParId = (await base.utilisateur.findFirstOrThrow({ where: { organisationId: ORG_C } })).id
    await base.document.create({
      data: {
        organisationId: ORG_C,
        nom: 'moyen.pdf',
        url: 'https://blob.test/seed/c-moyen',
        typeFichier: 'application/pdf',
        tailleOctets: 600 * MO,
        entiteType: 'COMMEMORATION',
        entiteId: commemorationC,
        televerseParId,
      },
    })
    await base.organisation.update({
      where: { id: ORG_C },
      data: { forfait: 'PRO', forfaitExpireLe: new Date(Date.now() - 40 * 86_400_000) },
    })

    const res = await envoyerDocument('C', commemorationC, 1 * MO)

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('600 Mo')
    expect(res.json().message).toContain('500 Mo')
  })
})
