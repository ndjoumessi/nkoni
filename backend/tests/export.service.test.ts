import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  assemblerDonneesContributions,
  genererExcel,
  genererPdf,
  type ExportPrisma,
  type DonneesExport,
} from '../src/services/export.service'
import { neutraliserFormuleCellule } from '../src/services/export-style'

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

  it('mise en forme : montants en NOMBRE alignés à droite, en-tête et TOTAL stylés', async () => {
    const buf = await genererExcel(donneesFixture)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Contributions')!

    // Colonne de montant (4) : reste un NOMBRE, format « #,##0 », aligné à droite.
    const cellMontant = ws.getRow(2).getCell(4)
    expect(typeof cellMontant.value).toBe('number')
    expect(cellMontant.numFmt).toBe('#,##0')
    expect(cellMontant.alignment?.horizontal).toBe('right')

    // En-tête : bandeau menthe foncé (fond plein), texte blanc gras.
    const enTete = ws.getRow(1).getCell(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((enTete.fill as any)?.fgColor?.argb).toBe('FF006A48')
    expect(enTete.font?.bold).toBe(true)

    // Ligne TOTAL : filet supérieur marqué (séparation nette du corps).
    const last = ws.getRow(ws.rowCount)
    expect(last.getCell(4).border?.top?.style).toBe('medium')
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

  it('accepte langue + devise (localisation date/montants) et reste un PDF valide', async () => {
    const buf = await genererPdf(donneesFixture, 'EN', 'EUR')
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(buf.subarray(-6).toString('latin1')).toContain('EOF')
    // Défauts rétrocompatibles : appel sans langue/devise (FR/FCFA) toujours valide.
    const parDefaut = await genererPdf(donneesFixture)
    expect(parDefaut.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})

describe('neutraliserFormuleCellule (audit Sécu E2)', () => {
  it('préfixe d\'une apostrophe toute valeur commençant par un caractère de formule', () => {
    expect(neutraliserFormuleCellule('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")')
    expect(neutraliserFormuleCellule('+1+1')).toBe('\'+1+1')
    expect(neutraliserFormuleCellule('-2')).toBe('\'-2')
    expect(neutraliserFormuleCellule('@SUM(A1)')).toBe('\'@SUM(A1)')
    expect(neutraliserFormuleCellule('\tTab')).toBe('\'\tTab')
    expect(neutraliserFormuleCellule('\rCR')).toBe('\'\rCR')
  })

  it('laisse les valeurs légitimes INCHANGÉES', () => {
    expect(neutraliserFormuleCellule('Tchoupa')).toBe('Tchoupa')
    expect(neutraliserFormuleCellule('Jean-Pierre')).toBe('Jean-Pierre') // le tiret n'est pas EN TÊTE
    expect(neutraliserFormuleCellule('')).toBe('')
    expect(neutraliserFormuleCellule('N°42')).toBe('N°42')
  })
})

describe('genererExcel — injection de formule neutralisée (audit Sécu E2)', () => {
  it('préfixe d\'une apostrophe un nom de membre malveillant dans le .xlsx', async () => {
    const donneesMalveillantes: DonneesExport = {
      genereLe: now,
      filtres: {},
      lignes: [
        {
          membreId: 'm1', nom: '=cmd|\'/c calc\'!A1', prenom: '@evil', annee: 2025,
          montantAttendu: 1_000, montantVerse: 1_000, montantValorise: 1_000,
        },
      ],
      totaux: { montantAttendu: 1_000, montantVerse: 1_000, montantValorise: 1_000 },
    }
    const buf = await genererExcel(donneesMalveillantes)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Contributions')!
    // Cellules stockées en TEXTE préfixé — jamais évaluées à l'ouverture.
    expect(ws.getRow(2).getCell(1).value).toBe('\'=cmd|\'/c calc\'!A1')
    expect(ws.getRow(2).getCell(2).value).toBe('\'@evil')
    // Aucune cellule n'est une formule ExcelJS ({ formula: … }).
    expect(typeof ws.getRow(2).getCell(1).value).toBe('string')
  })
})
