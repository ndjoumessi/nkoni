/**
 * Export des RAPPORTS financiers (enrichissement) — PDF / Excel.
 *
 * Réutilise l'infrastructure d'export (exceljs / PDFKit) mais consomme DIRECTEMENT la
 * sortie déjà calculée par `rapport.service` (RapportFinancier / ComparaisonPeriodes) —
 * il ne recalcule AUCUN agrégat. Fonctions PURES `données → Buffer`, sans accès base.
 *
 * Deux modes, symétriques à l'UI :
 *   - Évolution   : une ligne par année + une ligne TOTAL en gras (taux global pondéré).
 *   - Comparaison : tableau métrique × (année A, année B, variation %), avec la variation
 *     colorée en vert (progression) / rouge (régression) dans le .xlsx.
 */

import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import type {
  RapportFinancier,
  ComparaisonPeriodes,
  RapportAnnee,
} from './rapport.service'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Couleurs de mise en forme conditionnelle du .xlsx (ARGB), palette Laiton & Jade. */
const COULEUR = { vert: 'FF157A4F', rouge: 'FFB0432A' } as const

function arrondi2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Totaux d'une évolution : Σ attendu/collecté (+ taux global pondéré) et Σ des statuts. */
export function totauxEvolution(annees: RapportAnnee[]): {
  totalAttendu: number
  totalCollecte: number
  tauxRecouvrement: number
  aJour: number
  partiel: number
  nonAJour: number
} {
  const totalAttendu = annees.reduce((s, a) => s + a.totalAttendu, 0)
  const totalCollecte = annees.reduce((s, a) => s + a.totalCollecte, 0)
  return {
    totalAttendu,
    totalCollecte,
    tauxRecouvrement: totalAttendu > 0 ? arrondi2((totalCollecte / totalAttendu) * 100) : 0,
    aJour: annees.reduce((s, a) => s + a.membresParStatut.A_JOUR, 0),
    partiel: annees.reduce((s, a) => s + a.membresParStatut.PARTIEL, 0),
    nonAJour: annees.reduce((s, a) => s + a.membresParStatut.NON_A_JOUR, 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Évolution — Excel                                                          */
/* -------------------------------------------------------------------------- */

const COLONNES_EVOLUTION = [
  { header: 'Année', key: 'annee', width: 10 },
  { header: 'Attendu', key: 'attendu', width: 16 },
  { header: 'Collecté', key: 'collecte', width: 16 },
  { header: 'Taux (%)', key: 'taux', width: 12 },
  { header: 'À jour', key: 'aJour', width: 10 },
  { header: 'Partiel', key: 'partiel', width: 10 },
  { header: 'Non à jour', key: 'nonAJour', width: 12 },
] as const

/** Rapport d'évolution → classeur .xlsx (Buffer). Fonction pure. */
export async function genererEvolutionExcel(
  rapport: RapportFinancier,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Évolution')
  ws.columns = COLONNES_EVOLUTION.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  ws.getRow(1).font = { bold: true }

  for (const a of rapport.annees) {
    ws.addRow({
      annee: a.annee,
      attendu: a.totalAttendu,
      collecte: a.totalCollecte,
      taux: a.tauxRecouvrement,
      aJour: a.membresParStatut.A_JOUR,
      partiel: a.membresParStatut.PARTIEL,
      nonAJour: a.membresParStatut.NON_A_JOUR,
    })
  }

  const t = totauxEvolution(rapport.annees)
  const ligneTotal = ws.addRow({
    annee: 'TOTAL',
    attendu: t.totalAttendu,
    collecte: t.totalCollecte,
    taux: t.tauxRecouvrement,
    aJour: t.aJour,
    partiel: t.partiel,
    nonAJour: t.nonAJour,
  })
  ligneTotal.font = { bold: true }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* Comparaison — Excel (variation colorée)                                    */
/* -------------------------------------------------------------------------- */

interface LigneComparaison {
  label: string
  a: number | null
  b: number | null
  /** undefined = pas de variation pour cette métrique (ex. décomptes) ; null = non calculable. */
  variation?: number | null
}

/** Construit les lignes de la table de comparaison (partagé Excel + PDF). */
export function lignesComparaison(comp: ComparaisonPeriodes): LigneComparaison[] {
  const A = comp.rapportA
  const B = comp.rapportB
  return [
    { label: 'Total attendu', a: A?.totalAttendu ?? null, b: B?.totalAttendu ?? null, variation: comp.variations.totalAttendu },
    { label: 'Total collecté', a: A?.totalCollecte ?? null, b: B?.totalCollecte ?? null, variation: comp.variations.totalCollecte },
    { label: 'Taux de recouvrement (%)', a: A?.tauxRecouvrement ?? null, b: B?.tauxRecouvrement ?? null, variation: comp.variations.tauxRecouvrement },
    { label: 'Membres éligibles', a: A?.membresEligibles ?? null, b: B?.membresEligibles ?? null },
    { label: 'À jour', a: A?.membresParStatut.A_JOUR ?? null, b: B?.membresParStatut.A_JOUR ?? null },
    { label: 'Partiel', a: A?.membresParStatut.PARTIEL ?? null, b: B?.membresParStatut.PARTIEL ?? null },
    { label: 'Non à jour', a: A?.membresParStatut.NON_A_JOUR ?? null, b: B?.membresParStatut.NON_A_JOUR ?? null },
  ]
}

/** Comparaison → classeur .xlsx (Buffer). Variation colorée vert/rouge. Fonction pure. */
export async function genererComparaisonExcel(
  comp: ComparaisonPeriodes,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Comparaison')
  ws.columns = [
    { header: 'Métrique', key: 'metrique', width: 26 },
    { header: String(comp.anneeA), key: 'a', width: 16 },
    { header: String(comp.anneeB), key: 'b', width: 16 },
    { header: 'Variation (%)', key: 'variation', width: 14 },
  ]
  ws.getRow(1).font = { bold: true }

  for (const l of lignesComparaison(comp)) {
    const variationTexte =
      l.variation === undefined ? '' : l.variation === null ? 'n/a' : l.variation
    const row = ws.addRow({
      metrique: l.label,
      a: l.a === null ? '—' : l.a,
      b: l.b === null ? '—' : l.b,
      variation: variationTexte,
    })
    // Mise en forme conditionnelle : vert si progression, rouge si régression.
    if (typeof l.variation === 'number' && l.variation !== 0) {
      row.getCell('variation').font = {
        bold: true,
        color: { argb: l.variation > 0 ? COULEUR.vert : COULEUR.rouge },
      }
    }
  }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* PDF (PDFKit) — mise en page à colonnes fixes, comme l'export contributions */
/* -------------------------------------------------------------------------- */

/** Écrit un tableau simple (en-têtes + lignes) à des x fixes ; `gras` pour l'en-tête/total. */
function ecrireTableau(
  doc: PDFKit.PDFDocument,
  xs: number[],
  lignes: { valeurs: (string | number)[]; gras: boolean }[],
): void {
  const borneDroite = 555
  for (const { valeurs, gras } of lignes) {
    doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    const y = doc.y
    valeurs.forEach((v, i) => {
      const x = xs[i] ?? 40
      doc.text(String(v), x, y, { width: (xs[i + 1] ?? borneDroite) - x - 4, lineBreak: false })
    })
    doc.moveDown(0.6)
  }
}

function creerPdf(remplir: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    remplir(doc)
    doc.end()
  })
}

/** Rapport d'évolution → document .pdf (Buffer). Fonction pure. */
export function genererEvolutionPdf(
  rapport: RapportFinancier,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  return creerPdf((doc) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('NKONI — Rapport financier (évolution)', { align: 'center' })
    doc.moveDown(0.3)
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Années ${rapport.anneeDebut}–${rapport.anneeFin}  ·  Généré le ${genereLe.toISOString()}`,
        { align: 'center' },
      )
    doc.moveDown(1)

    const xs = [40, 95, 185, 275, 335, 395, 455]
    const enTetes = COLONNES_EVOLUTION.map((c) => c.header)
    const lignes: { valeurs: (string | number)[]; gras: boolean }[] = [
      { valeurs: enTetes, gras: true },
      ...rapport.annees.map((a) => ({
        valeurs: [
          a.annee,
          a.totalAttendu,
          a.totalCollecte,
          a.tauxRecouvrement,
          a.membresParStatut.A_JOUR,
          a.membresParStatut.PARTIEL,
          a.membresParStatut.NON_A_JOUR,
        ],
        gras: false,
      })),
    ]
    const t = totauxEvolution(rapport.annees)
    lignes.push({
      valeurs: ['TOTAL', t.totalAttendu, t.totalCollecte, t.tauxRecouvrement, t.aJour, t.partiel, t.nonAJour],
      gras: true,
    })
    ecrireTableau(doc, xs, lignes)
  })
}

/** Comparaison → document .pdf (Buffer). Fonction pure. */
export function genererComparaisonPdf(
  comp: ComparaisonPeriodes,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  return creerPdf((doc) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`NKONI — Comparaison ${comp.anneeA} vs ${comp.anneeB}`, { align: 'center' })
    doc.moveDown(0.3)
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Généré le ${genereLe.toISOString()}`, { align: 'center' })
    doc.moveDown(1)

    const xs = [40, 250, 350, 450]
    const lignes: { valeurs: (string | number)[]; gras: boolean }[] = [
      { valeurs: ['Métrique', String(comp.anneeA), String(comp.anneeB), 'Variation (%)'], gras: true },
      ...lignesComparaison(comp).map((l) => ({
        valeurs: [
          l.label,
          l.a === null ? '—' : l.a,
          l.b === null ? '—' : l.b,
          l.variation === undefined ? '' : l.variation === null ? 'n/a' : l.variation,
        ],
        gras: false,
      })),
    ]
    ecrireTableau(doc, xs, lignes)
  })
}
