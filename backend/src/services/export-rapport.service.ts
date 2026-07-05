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
  ComparaisonMulti,
  RapportAnnee,
  VariationsComparaison,
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
  borneDroite = 555,
): void {
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

function creerPdf(
  remplir: (doc: PDFKit.PDFDocument) => void,
  paysage = false,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: paysage ? 'landscape' : 'portrait',
      margin: 40,
    })
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

/* -------------------------------------------------------------------------- */
/* Comparaison MULTI-années (une colonne par année + Δ vs la précédente)      */
/* -------------------------------------------------------------------------- */

/** Métriques de la table de comparaison ; `cle` présent ⇒ métrique portant une variation. */
interface MetriqueMulti {
  label: string
  valeur: (r: RapportAnnee | null) => number | null
  cle?: keyof VariationsComparaison
}

const METRIQUES_MULTI: MetriqueMulti[] = [
  { label: 'Total attendu', valeur: (r) => r?.totalAttendu ?? null, cle: 'totalAttendu' },
  { label: 'Total collecté', valeur: (r) => r?.totalCollecte ?? null, cle: 'totalCollecte' },
  { label: 'Taux de recouvrement (%)', valeur: (r) => r?.tauxRecouvrement ?? null, cle: 'tauxRecouvrement' },
  { label: 'Membres éligibles', valeur: (r) => r?.membresEligibles ?? null },
  { label: 'À jour', valeur: (r) => r?.membresParStatut.A_JOUR ?? null },
  { label: 'Partiel', valeur: (r) => r?.membresParStatut.PARTIEL ?? null },
  { label: 'Non à jour', valeur: (r) => r?.membresParStatut.NON_A_JOUR ?? null },
]

/** Texte d'une cellule de variation (première année = '', non calculable = 'n/a'). */
function celluleVariation(m: MetriqueMulti, ac: ComparaisonMulti['annees'][number]): string | number {
  if (!m.cle) return '' // métrique de décompte : pas de variation
  const v = ac.variations ? ac.variations[m.cle] : null
  return v === null || v === undefined ? 'n/a' : v
}

/** Comparaison multi-années → une ligne par métrique, cellules valeur + Δ par année. */
function lignesMulti(comp: ComparaisonMulti): { valeurs: (string | number)[]; gras: boolean }[] {
  return METRIQUES_MULTI.map((m) => {
    const valeurs: (string | number)[] = [m.label]
    comp.annees.forEach((ac, i) => {
      const v = m.valeur(ac.rapport)
      valeurs.push(v === null ? '—' : v)
      if (i > 0) valeurs.push(celluleVariation(m, ac))
    })
    return { valeurs, gras: false }
  })
}

/** En-têtes de la table multi : Métrique, puis (année, Δ %) pour chaque année (Δ dès la 2e). */
function entetesMulti(comp: ComparaisonMulti): string[] {
  const enTetes = ['Métrique']
  comp.annees.forEach((ac, i) => {
    enTetes.push(String(ac.annee))
    if (i > 0) enTetes.push('Δ %')
  })
  return enTetes
}

/** Indices de colonne (1-based) des cellules Δ, pour la coloration conditionnelle. */
function colonnesVariation(comp: ComparaisonMulti): number[] {
  const cols: number[] = []
  let col = 1 // colonne « Métrique »
  comp.annees.forEach((_, i) => {
    col += 1 // colonne valeur de l'année
    if (i > 0) {
      col += 1 // colonne Δ
      cols.push(col)
    }
  })
  return cols
}

/** Comparaison multi-années → classeur .xlsx (Buffer). Variation colorée. Fonction pure. */
export async function genererComparaisonMultiExcel(
  comp: ComparaisonMulti,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Comparaison')
  const colonnes: { header: string; key: string; width: number }[] = [
    { header: 'Métrique', key: 'metrique', width: 26 },
  ]
  comp.annees.forEach((ac, i) => {
    colonnes.push({ header: String(ac.annee), key: `a${i}`, width: 16 })
    if (i > 0) colonnes.push({ header: 'Δ %', key: `d${i}`, width: 11 })
  })
  ws.columns = colonnes
  ws.getRow(1).font = { bold: true }

  const deltaCols = colonnesVariation(comp)
  for (const ligne of lignesMulti(comp)) {
    const row = ws.addRow(ligne.valeurs)
    for (const dc of deltaCols) {
      const val = row.getCell(dc).value
      if (typeof val === 'number' && val !== 0) {
        row.getCell(dc).font = { bold: true, color: { argb: val > 0 ? COULEUR.vert : COULEUR.rouge } }
      }
    }
  }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/** Comparaison multi-années → document .pdf (Buffer, paysage pour la largeur). Fonction pure. */
export function genererComparaisonMultiPdf(
  comp: ComparaisonMulti,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  return creerPdf((doc) => {
    const anneesTexte = comp.annees.map((a) => a.annee).join(', ')
    doc.font('Helvetica-Bold').fontSize(16).text('NKONI — Comparaison multi-années', {
      align: 'center',
    })
    doc.moveDown(0.3)
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Années ${anneesTexte}  ·  Généré le ${genereLe.toISOString()}`, { align: 'center' })
    doc.moveDown(1)

    // Colonnes dynamiques : « Métrique » large + colonnes réparties sur la largeur paysage.
    const enTetes = entetesMulti(comp)
    const xDebut = 40
    const borneDroite = 800 // A4 paysage (842) - marge
    const largeurMetrique = 150
    const largeurCol = (borneDroite - (xDebut + largeurMetrique)) / (enTetes.length - 1)
    const xs = [xDebut]
    for (let i = 1; i < enTetes.length; i++) {
      xs.push(xDebut + largeurMetrique + (i - 1) * largeurCol)
    }

    const lignes: { valeurs: (string | number)[]; gras: boolean }[] = [
      { valeurs: enTetes, gras: true },
      ...lignesMulti(comp),
    ]
    ecrireTableau(doc, xs, lignes, borneDroite)
  }, true)
}
