import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  assemblerDonneesContributions,
  genererExcel,
  genererPdf,
  type ExportPrisma,
  type DonneesExport,
} from '../src/services/export.service'

/**
 * Tests unitaires de l'export (§5.9) : assemblage (Prisma mocké) + formatage réel
 * (bytes magiques + relecture du .xlsx pour prouver le contenu). now injecté.
 */

const now = new Date('2026-06-15T09:00:00Z')

// Volontairement dans le désordre pour prouver le tri (nom, prénom, année).
const contributionsBrutes = [
  {
    membreId: 'm2', annee: 2025, montantAttendu: 10_000, montantVerse: 5_000,
    montantValorise: 5_000, membre: { nom: 'Wamba', prenom: 'Alice' },
  },
  {
    membreId: 'm1', annee: 2025, montantAttendu: 10_000, montantVerse: 10_000,
    montantValorise: 10_000, membre: { nom: 'Tchoupa', prenom: 'Bernard' },
  },
  {
    membreId: 'm1', annee: 2024, montantAttendu: 8_000, montantVerse: 8_000,
    montantValorise: 8_000, membre: { nom: 'Tchoupa', prenom: 'Bernard' },
  },
]

function buildMock() {
  const recu: { where?: unknown } = {}
  const prisma: ExportPrisma = {
    contribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        recu.where = where
        let res = contributionsBrutes
        if (where?.annee !== undefined) res = res.filter((c) => c.annee === where.annee)
        if (where?.membreId !== undefined) res = res.filter((c) => c.membreId === where.membreId)
        return res
      },
    },
  }
  return { prisma, recu }
}

describe('assemblerDonneesContributions (§5.9)', () => {
  it('trie par nom/prénom/année et calcule les totaux', async () => {
    const { prisma } = buildMock()
    const d = await assemblerDonneesContributions(prisma, {}, now)

    expect(d.lignes.map((l) => `${l.nom} ${l.annee}`)).toEqual([
      'Tchoupa 2024', // Tchoupa avant Wamba, 2024 avant 2025
      'Tchoupa 2025',
      'Wamba 2025',
    ])
    expect(d.totaux).toEqual({
      montantAttendu: 28_000, // 10000 + 10000 + 8000
      montantVerse: 23_000, // 5000 + 10000 + 8000
      montantValorise: 23_000,
    })
    expect(d.genereLe).toEqual(now)
  })

  it('propage les filtres annee/membreId dans la requête Prisma', async () => {
    const { prisma, recu } = buildMock()
    const d = await assemblerDonneesContributions(prisma, { annee: 2025, membreId: 'm1' }, now)
    expect(recu.where).toEqual({ annee: 2025, membreId: 'm1' })
    expect(d.lignes).toHaveLength(1)
    expect(d.lignes[0]).toMatchObject({ membreId: 'm1', annee: 2025 })
    expect(d.filtres).toEqual({ annee: 2025, membreId: 'm1' })
  })
})

const donneesFixture: DonneesExport = {
  genereLe: now,
  filtres: { annee: 2025 },
  lignes: [
    {
      membreId: 'm1', nom: 'Tchoupa', prenom: 'Bernard', annee: 2025,
      montantAttendu: 10_000, montantVerse: 10_000, montantValorise: 10_000,
    },
    {
      membreId: 'm2', nom: 'Wamba', prenom: 'Alice', annee: 2025,
      montantAttendu: 10_000, montantVerse: 5_000, montantValorise: 5_000,
    },
  ],
  totaux: { montantAttendu: 20_000, montantVerse: 15_000, montantValorise: 15_000 },
}

describe('genererExcel (§5.9)', () => {
  it('produit un .xlsx valide (signature ZIP « PK ») relisible avec le bon contenu', async () => {
    const buf = await genererExcel(donneesFixture)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // xlsx == archive ZIP

    // Relecture : prouve la structure réelle (en-têtes, une ligne, la ligne TOTAL).
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Contributions')!
    expect(ws.getRow(1).getCell(1).value).toBe('Nom')
    expect(ws.getRow(2).getCell(1).value).toBe('Tchoupa')
    expect(ws.getRow(2).getCell(4).value).toBe(10_000)
    // Dernière ligne = totaux.
    const last = ws.getRow(ws.rowCount)
    expect(last.getCell(1).value).toBe('TOTAL')
    expect(last.getCell(6).value).toBe(15_000)
  })
})

describe('genererPdf (§5.9)', () => {
  it('produit un .pdf valide (signature « %PDF »)', async () => {
    const buf = await genererPdf(donneesFixture)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    // Un PDF se termine par le marqueur EOF.
    expect(buf.subarray(-6).toString('latin1')).toContain('EOF')
  })
})
