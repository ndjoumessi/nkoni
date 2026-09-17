import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { genererExcel, type DonneesExport } from '../src/services/export.service'
import {
  genererEvolutionExcel,
  genererComparaisonExcel,
} from '../src/services/export-rapport.service'
import { libellesExport } from '../src/services/export-libelles'

/**
 * INTERNATIONALISATION DES DOCUMENTS EXPORTÉS (défaut constaté en production le 2026-09-17).
 *
 * Les exports recevaient déjà la langue, mais ne s'en servaient que pour les MONTANTS et les DATES :
 * titres, en-têtes de colonnes, nom de feuille et ligne TOTAL restaient en dur en français. Un
 * exportateur anglophone obtenait un document au titre français avec des nombres à l'anglaise.
 *
 * On assert ici l'EFFET OBSERVABLE — le classeur est relu et ses en-têtes inspectés — et non la
 * simple existence d'une table de libellés : c'est le passage de la langue JUSQU'AU document qui
 * manquait, pas le vocabulaire.
 *
 * Le PDF n'est pas relu (PDFKit compresse ses flux) : ses libellés viennent de la MÊME source, et
 * la parité FR/EN de celle-ci est tenue à la COMPILATION (`EN: typeof FR`), pas par un test.
 */

const GENERE_LE = new Date('2026-09-17T20:45:00Z')

const DONNEES: DonneesExport = {
  genereLe: GENERE_LE,
  filtres: {},
  lignes: [
    {
      membreId: 'm1',
      nom: 'Abena',
      prenom: 'Fabrice',
      annee: 2026,
      montantAttendu: 24000,
      montantVerse: 24000,
      montantValorise: 24000,
    },
  ],
  totaux: { montantAttendu: 24000, montantVerse: 24000, montantValorise: 24000 },
}

const RAPPORT = {
  anneeDebut: 2025,
  anneeFin: 2026,
  annees: [
    {
      annee: 2026,
      totalAttendu: 24000,
      totalCollecte: 24000,
      tauxRecouvrement: 100,
      membresEligibles: 1,
      membresParStatut: { A_JOUR: 1, PARTIEL: 0, NON_A_JOUR: 0 },
    },
  ],
}

const COMPARAISON = {
  anneeA: 2025,
  anneeB: 2026,
  a: RAPPORT.annees[0],
  b: RAPPORT.annees[0],
  variations: {
    totalAttendu: 0,
    totalCollecte: 0,
    tauxRecouvrement: 0,
  },
}

/** En-têtes de la première ligne du premier onglet, plus le nom de l'onglet. */
async function relireClasseur(buffer: Buffer): Promise<{ feuille: string; entetes: string[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  const entetes: string[] = []
  ws.getRow(1).eachCell((cell) => entetes.push(String(cell.value ?? '')))
  return { feuille: ws.name, entetes }
}

describe('exports — libellés dans la langue de l’exportateur', () => {
  it('contributions (.xlsx) : en-têtes et onglet en anglais pour un exportateur EN', async () => {
    const { feuille, entetes } = await relireClasseur(await genererExcel(DONNEES, 'EN'))
    expect(entetes).toEqual([
      'Last name',
      'First name',
      'Year',
      'Expected amount',
      'Paid amount',
      'Credited amount',
    ])
    expect(feuille).toBe('Contributions')
    // Aucun libellé français ne doit subsister.
    expect(entetes.join(' ')).not.toMatch(/Nom|Prénom|Année|Montant/)
  })

  it('contributions (.xlsx) : le français reste le comportement par défaut', async () => {
    const { entetes } = await relireClasseur(await genererExcel(DONNEES, 'FR'))
    expect(entetes[0]).toBe('Nom')
    expect(entetes[3]).toBe('Montant attendu')
    // Sans langue explicite (appelant historique), on retombe sur le français.
    const { entetes: defaut } = await relireClasseur(await genererExcel(DONNEES))
    expect(defaut).toEqual(entetes)
  })

  it('rapport d’évolution (.xlsx) : en-têtes et onglet en anglais', async () => {
    const { feuille, entetes } = await relireClasseur(await genererEvolutionExcel(RAPPORT, GENERE_LE, 'EN'))
    expect(entetes).toEqual([
      'Year',
      'Expected',
      'Collected',
      'Rate (%)',
      'Up to date',
      'Partial',
      'Not up to date',
    ])
    expect(feuille).toBe('Trend')
    expect(entetes.join(' ')).not.toMatch(/Année|Attendu|Collecté|Taux|jour|Partiel/)
  })

  it('comparaison (.xlsx) : en-têtes en anglais', async () => {
    const { feuille, entetes } = await relireClasseur(
      await genererComparaisonExcel(COMPARAISON, GENERE_LE, 'EN'),
    )
    expect(feuille).toBe('Comparison')
    expect(entetes[0]).toBe('Metric')
    expect(entetes.join(' ')).not.toMatch(/Métrique|Variation/)
  })

  it('la table de libellés distingue bien les deux langues', () => {
    const fr = libellesExport('FR')
    const en = libellesExport('EN')
    expect(Object.keys(fr)).toEqual(Object.keys(en))
    // « TOTAL » est identique dans les deux langues ; tout le reste doit différer.
    const identiques = Object.keys(fr).filter(
      (k) => fr[k as keyof typeof fr] === en[k as keyof typeof en],
    )
    expect(identiques).toEqual(['total', 'contributionsFeuille'])
  })
})
