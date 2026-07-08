import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  genererEvolutionExcel,
  genererEvolutionPdf,
  genererComparaisonExcel,
  genererComparaisonPdf,
  genererComparaisonMultiExcel,
  genererComparaisonMultiPdf,
  totauxEvolution,
} from '../src/services/export-rapport.service'
import type {
  RapportFinancier,
  ComparaisonPeriodes,
  ComparaisonMulti,
} from '../src/services/rapport.service'

/**
 * Export des rapports financiers : formatage réel (bytes magiques PK/%PDF + relecture du
 * .xlsx pour prouver le contenu, y compris la ligne TOTAL et la couleur de variation).
 * Consomme des fixtures = sortie de rapport.service (aucun recalcul ici).
 */

const now = new Date('2026-06-15T09:00:00Z')

const rapport: RapportFinancier = {
  anneeDebut: 2024,
  anneeFin: 2025,
  annees: [
    {
      annee: 2024,
      montantAttendu: 10_000,
      membresEligibles: 2,
      totalAttendu: 20_000,
      totalCollecte: 20_000,
      tauxRecouvrement: 100,
      membresParStatut: { A_JOUR: 2, PARTIEL: 0, NON_A_JOUR: 0 },
    },
    {
      annee: 2025,
      montantAttendu: 12_000,
      membresEligibles: 2,
      totalAttendu: 24_000,
      totalCollecte: 12_000,
      tauxRecouvrement: 50,
      membresParStatut: { A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 1 },
    },
  ],
}

const comparaison: ComparaisonPeriodes = {
  anneeA: 2024,
  anneeB: 2025,
  rapportA: rapport.annees[0],
  rapportB: rapport.annees[1],
  variations: { totalAttendu: 20, totalCollecte: -40, tauxRecouvrement: -50 },
}

describe('totauxEvolution', () => {
  it('Σ attendu/collecté, taux global pondéré, Σ statuts', () => {
    const t = totauxEvolution(rapport.annees)
    expect(t.totalAttendu).toBe(44_000)
    expect(t.totalCollecte).toBe(32_000)
    expect(t.tauxRecouvrement).toBe(72.73) // 32000/44000
    expect(t.aJour).toBe(3)
    expect(t.nonAJour).toBe(1)
  })
})

describe('Évolution — Excel', () => {
  it('produit un .xlsx (PK) relisible : en-têtes, lignes années, ligne TOTAL', async () => {
    const buf = await genererEvolutionExcel(rapport, now)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Évolution')!
    expect(ws.getRow(1).getCell(1).value).toBe('Année')
    expect(ws.getRow(2).getCell(1).value).toBe(2024)
    expect(ws.getRow(2).getCell(2).value).toBe(20_000) // attendu
    expect(ws.getRow(2).getCell(4).value).toBe(100) // taux
    // Dernière ligne = TOTAL.
    const last = ws.getRow(ws.rowCount)
    expect(last.getCell(1).value).toBe('TOTAL')
    expect(last.getCell(2).value).toBe(44_000)
    expect(last.getCell(4).value).toBe(72.73)
  })

  it('mise en forme premium : bandeau menthe, montants #,##0 à droite, taux non arrondi', async () => {
    const buf = await genererEvolutionExcel(rapport, now)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Évolution')!

    // En-tête : bandeau menthe foncé, texte blanc gras.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ws.getRow(1).getCell(1).fill as any)?.fgColor?.argb).toBe('FF006A48')
    // Colonne « Attendu » : montant en NOMBRE, format #,##0, aligné à droite.
    const attendu = ws.getRow(2).getCell(2)
    expect(typeof attendu.value).toBe('number')
    expect(attendu.numFmt).toBe('#,##0')
    expect(attendu.alignment?.horizontal).toBe('right')
    // Le TAUX ne reçoit PAS de format #,##0 (sinon 72.73 s'afficherait « 73 »).
    const last = ws.getRow(ws.rowCount)
    expect(last.getCell(4).numFmt).toBeFalsy()
    expect(last.getCell(4).value).toBe(72.73)
  })
})

describe('Évolution — PDF', () => {
  it('produit un .pdf (%PDF … EOF)', async () => {
    const buf = await genererEvolutionPdf(rapport, now)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(buf.subarray(-6).toString('latin1')).toContain('EOF')
  })
})

describe('Comparaison — Excel', () => {
  it('table métrique × (A, B, variation) avec couleur verte/rouge sur la variation', async () => {
    const buf = await genererComparaisonExcel(comparaison, now)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Comparaison')!
    // En-têtes : années A et B en colonnes.
    expect(ws.getRow(1).getCell(2).value).toBe('2024')
    expect(ws.getRow(1).getCell(3).value).toBe('2025')
    expect(ws.getRow(1).getCell(4).value).toBe('Variation (%)')

    // Ligne « Total attendu » : 20000 → 24000, variation +20 (verte).
    const rowAttendu = ws.getRow(2)
    expect(rowAttendu.getCell(1).value).toBe('Total attendu')
    expect(rowAttendu.getCell(2).value).toBe(20_000)
    expect(rowAttendu.getCell(3).value).toBe(24_000)
    expect(rowAttendu.getCell(4).value).toBe(20)
    expect(rowAttendu.getCell(4).font?.color?.argb).toBe('FF157A4F') // vert

    // Ligne « Total collecté » : variation -40 (rouge).
    const rowCollecte = ws.getRow(3)
    expect(rowCollecte.getCell(4).value).toBe(-40)
    expect(rowCollecte.getCell(4).font?.color?.argb).toBe('FFB0432A') // rouge
  })

  it('année sans barème : cellules « — » et variation « n/a », sans erreur', async () => {
    const compNull: ComparaisonPeriodes = {
      anneeA: 2025,
      anneeB: 2026,
      rapportA: rapport.annees[1],
      rapportB: null,
      variations: { totalAttendu: null, totalCollecte: null, tauxRecouvrement: null },
    }
    const buf = await genererComparaisonExcel(compNull, now)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Comparaison')!
    expect(ws.getRow(2).getCell(3).value).toBe('—') // année B absente
    expect(ws.getRow(2).getCell(4).value).toBe('n/a') // variation non calculable
  })
})

describe('Comparaison — PDF', () => {
  it('produit un .pdf (%PDF … EOF)', async () => {
    const buf = await genererComparaisonPdf(comparaison, now)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(buf.subarray(-6).toString('latin1')).toContain('EOF')
  })
})

/* -------------------------------------------------------------------------- */
/* Comparaison multi-années                                                   */
/* -------------------------------------------------------------------------- */

const multi: ComparaisonMulti = {
  annees: [
    {
      annee: 2022,
      rapport: {
        annee: 2022, montantAttendu: 10_000, membresEligibles: 1, totalAttendu: 10_000,
        totalCollecte: 10_000, tauxRecouvrement: 100, membresParStatut: { A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 0 },
      },
      variations: null, // première année → pas de variation
    },
    {
      annee: 2023,
      rapport: {
        annee: 2023, montantAttendu: 10_000, membresEligibles: 1, totalAttendu: 10_000,
        totalCollecte: 5_000, tauxRecouvrement: 50, membresParStatut: { A_JOUR: 0, PARTIEL: 1, NON_A_JOUR: 0 },
      },
      variations: { totalAttendu: 0, totalCollecte: -50, tauxRecouvrement: -50 },
    },
    {
      annee: 2024,
      rapport: {
        annee: 2024, montantAttendu: 12_000, membresEligibles: 1, totalAttendu: 12_000,
        totalCollecte: 12_000, tauxRecouvrement: 100, membresParStatut: { A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 0 },
      },
      variations: { totalAttendu: 20, totalCollecte: 140, tauxRecouvrement: 100 },
    },
  ],
}

describe('Comparaison multi-années — Excel', () => {
  it('en-têtes = Métrique + (année, Δ %) par année ; variations colorées', async () => {
    const buf = await genererComparaisonMultiExcel(multi, now)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Comparaison')!

    // En-têtes : Métrique | 2022 | 2023 | Δ % | 2024 | Δ %
    expect(ws.getRow(1).getCell(2).value).toBe('2022')
    expect(ws.getRow(1).getCell(3).value).toBe('2023')
    expect(ws.getRow(1).getCell(4).value).toBe('Δ %')
    expect(ws.getRow(1).getCell(5).value).toBe('2024')
    expect(ws.getRow(1).getCell(6).value).toBe('Δ %')

    // Ligne « Total attendu » : Δ2024 = +20 (verte).
    const rowAttendu = ws.getRow(2)
    expect(rowAttendu.getCell(1).value).toBe('Total attendu')
    expect(rowAttendu.getCell(6).value).toBe(20)
    expect(rowAttendu.getCell(6).font?.color?.argb).toBe('FF157A4F') // vert

    // Ligne « Total collecté » : Δ2023 = -50 (rouge).
    const rowCollecte = ws.getRow(3)
    expect(rowCollecte.getCell(4).value).toBe(-50)
    expect(rowCollecte.getCell(4).font?.color?.argb).toBe('FFB0432A') // rouge
  })
})

describe('Comparaison multi-années — PDF', () => {
  it('produit un .pdf paysage (%PDF … EOF)', async () => {
    const buf = await genererComparaisonMultiPdf(multi, now)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(buf.subarray(-6).toString('latin1')).toContain('EOF')
  })
})
