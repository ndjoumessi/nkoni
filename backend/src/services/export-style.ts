/**
 * Style d'export « Menthe & Encre » PARTAGÉ par les exports PDF/Excel (contributions §5.9 ET
 * rapports financiers). Extrait pour ne pas dupliquer la palette, le formatage des montants et le
 * dessin des tableaux premium (titre menthe, filet or, bandeau d'en-tête, zébrure, ligne TOTAL).
 *
 * Palette : jetons oklch du front convertis en sRGB, ASSOMBRIS pour l'impression sur fond blanc
 * (contraste suffisant, encre raisonnable). Conversions exactes (cf. `frontend/src/index.css`) :
 *   menthe      #009b66  ← --emerald-deep oklch(0.60 0.15 163)   titre + accents
 *   mentheFonce #006a48  ← menthe assombrie   oklch(0.46 0.11 165) bandeau d'en-tête (texte blanc)
 *   mentheTint  #e9f8f0  ← menthe très claire oklch(0.965 0.018 165) zébrure / fond TOTAL
 *   or          #a28137  ← --amber assombri   oklch(0.62 0.10 85)  filet décoratif sous le titre
 *   encre       #222b2b                                            texte courant
 *   gris        #636a6d                                            sous-titre discret
 *   filet       #d5d8d9                                            filets fins entre lignes
 */
import { formatMontant, formatNombre, formatPourcentage, type Langue, type Devise } from '../lib/i18n'

/** Palette hex pour PDFKit. */
export const NK = {
  menthe: '#009b66',
  mentheFonce: '#006a48',
  mentheTint: '#e9f8f0',
  or: '#a28137',
  encre: '#222b2b',
  gris: '#636a6d',
  filet: '#d5d8d9',
  blanc: '#ffffff',
} as const

/** Variante ARGB (préfixe alpha « FF ») pour ExcelJS, mêmes teintes. */
export const XL = {
  mentheFonce: 'FF006A48',
  mentheTint: 'FFE9F8F0',
  menthe: 'FF009B66',
  blanc: 'FFFFFFFF',
} as const

/**
 * Montant formaté pour PDFKit : `Intl` emploie une ESPACE FINE INSÉCABLE (U+202F) comme séparateur
 * de milliers et une insécable (U+00A0) avant le symbole ; la police Helvetica intégrée de PDFKit
 * ne les encode pas (rendues « / »). On les remplace par une espace normale → « 10 000 FCFA ».
 * (L'Excel garde des NOMBRES, non concerné.)
 */
export function montantExport(n: number, langue: Langue, devise: Devise): string {
  return formatMontant(n, langue, devise).replace(/[\u202f\u00a0]/g, ' ')
}

/**
 * Nombre group\u00e9 SANS devise, normalis\u00e9 pour PDFKit (m\u00eames espaces ins\u00e9cables \u00e0 remplacer).
 * Pour les tableaux denses (comparaison multi-ann\u00e9es) o\u00f9 le suffixe \u00ab FCFA \u00bb d\u00e9borderait des
 * colonnes \u00e9troites \u2014 la devise y est rappel\u00e9e dans le sous-titre.
 */
export function nombreExport(n: number, langue: Langue): string {
  return formatNombre(n, langue).replace(/[\u202f\u00a0]/g, ' ')
}

/**
 * Variation en pourcentage pour un PDF : signe explicite (`+` si positif ; le `-` vient du
 * formatage), suffixe \u00ab % \u00bb, d\u00e9cimales conserv\u00e9es. Normalis\u00e9 pour PDFKit \u2014 espaces ins\u00e9cables
 * (U+202F/U+00A0) et le vrai signe moins (U+2212, non encod\u00e9 par Helvetica) remplac\u00e9s par leurs
 * \u00e9quivalents ASCII. Ex. FR : `+3 500 %`, `-2,78 %`, `0 %`.
 */
export function pourcentExport(n: number, langue: Langue): string {
  const texte = formatPourcentage(n, langue)
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\u2212/g, '-')
  return `${n > 0 ? '+' : ''}${texte} %`
}

/* -------------------------------------------------------------------------- */
/* PDF (PDFKit) — en-tête de document + tableau premium générique             */
/* -------------------------------------------------------------------------- */

/**
 * En-tête de document : titre menthe, sous-titre encre, ligne méta grise (filtres + « Généré le »
 * localisé), filet or. Rendu UNE fois (page 1). Retourne le `y` de départ du tableau.
 */
export function enteteDocument(
  doc: PDFKit.PDFDocument,
  opts: { titre: string; sousTitre: string; meta: string; gauche?: number; droite?: number },
): number {
  const gauche = opts.gauche ?? 40
  const droite = opts.droite ?? 555
  doc.fillColor(NK.menthe).font('Helvetica-Bold').fontSize(18).text(opts.titre, gauche, 42)
  doc.fillColor(NK.encre).font('Helvetica').fontSize(11).text(opts.sousTitre, gauche, 67)

  // La ligne méta est écrite à un y FIXE (85) ; on la borne à UNE ligne (troncature « … » si trop
  // longue, ex. liste d'années illimitée) pour qu'elle ne déborde jamais sur le filet or (y=105) ni
  // sur le bandeau d'en-tête du tableau (y=117). `lineBreak: false` empêche tout retour à la ligne.
  doc.fillColor(NK.gris).font('Helvetica').fontSize(9)
  const largeurMeta = droite - gauche
  let meta = opts.meta
  if (doc.widthOfString(meta) > largeurMeta) {
    while (meta.length > 1 && doc.widthOfString(meta + '…') > largeurMeta) meta = meta.slice(0, -1)
    meta = meta + '…'
  }
  doc.text(meta, gauche, 85, { lineBreak: false })

  doc.moveTo(gauche, 105).lineTo(droite, 105).lineWidth(1.5).strokeColor(NK.or).stroke()
  return 117
}

export interface ColonnePremium {
  label: string
  largeur: number
  align: 'left' | 'right'
}

/**
 * Dessine le CORPS d'un tableau premium (bandeau d'en-tête de colonnes menthe foncé à texte blanc,
 * lignes zébrées à filets fins, ligne TOTAL soulignée). Les cellules sont des chaînes déjà
 * formatées (montants via `montantExport`, comptes/années en clair) — l'alignement se décide par
 * colonne. Gère le saut de page (réaffiche le bandeau d'en-tête). Orientation via `doc.page.height`.
 */
export function dessinerCorpsPremium(
  doc: PDFKit.PDFDocument,
  opts: {
    colonnes: ColonnePremium[]
    lignes: string[][]
    total?: string[]
    gauche: number
    droite: number
    yStart: number
  },
): void {
  const { colonnes, lignes, total, gauche, droite, yStart } = opts
  const LARGEUR = droite - gauche
  const H = 20
  const PAD = 6
  const BAS = doc.page.height - 42

  // Positions x cumulées (une seule fois, sans indexation « possiblement undefined »).
  let cx = gauche
  const cols = colonnes.map((c) => {
    const positioned = { ...c, x: cx }
    cx += c.largeur
    return positioned
  })

  const cellule = (texte: string, col: (typeof cols)[number], y: number): void => {
    const x = col.align === 'right' ? col.x : col.x + PAD
    doc.text(texte, x, y, { width: col.largeur - PAD, align: col.align, lineBreak: false })
  }

  const dessinerEnTete = (y: number): number => {
    doc.rect(gauche, y, LARGEUR, H + 2).fill(NK.mentheFonce)
    doc.fillColor(NK.blanc).font('Helvetica-Bold').fontSize(8.5)
    for (const col of cols) cellule(col.label, col, y + 6)
    return y + H + 2
  }

  let y = dessinerEnTete(yStart)
  doc.font('Helvetica').fontSize(9)

  lignes.forEach((ligne, idx) => {
    if (y + H > BAS) {
      doc.addPage()
      y = dessinerEnTete(40)
      doc.font('Helvetica').fontSize(9)
    }
    if (idx % 2 === 1) doc.rect(gauche, y, LARGEUR, H).fill(NK.mentheTint) // zébrure
    doc.fillColor(NK.encre)
    cols.forEach((col, i) => cellule(ligne[i] ?? '', col, y + 6))
    doc.moveTo(gauche, y + H).lineTo(droite, y + H).lineWidth(0.5).strokeColor(NK.filet).stroke()
    y += H
  })

  if (total) {
    // Si la ligne TOTAL déborde sur une nouvelle page, on RÉAFFICHE le bandeau d'en-tête de colonnes
    // au-dessus (sinon le TOTAL flotterait seul, sans savoir quelle colonne est quoi).
    if (y + H > BAS) {
      doc.addPage()
      y = dessinerEnTete(40)
    }
    doc.rect(gauche, y, LARGEUR, H + 2).fill(NK.mentheTint)
    doc.moveTo(gauche, y).lineTo(droite, y).lineWidth(1.5).strokeColor(NK.menthe).stroke()
    doc.fillColor(NK.mentheFonce).font('Helvetica-Bold').fontSize(9.5)
    cols.forEach((col, i) => cellule(total[i] ?? '', col, y + 6))
  }
}

/* -------------------------------------------------------------------------- */
/* Excel (exceljs) — styles partagés (ne changent JAMAIS les valeurs)         */
/* -------------------------------------------------------------------------- */

// Type minimal des cellules/lignes exceljs manipulées (évite d'importer le type ExcelJS ici).
interface CelluleXL {
  font?: unknown
  fill?: unknown
  border?: unknown
  numFmt?: string
  alignment?: unknown
}
interface LigneXL {
  height?: number
  eachCell(cb: (cell: CelluleXL, colNumber: number) => void): void
}

/** Bandeau d'en-tête : fond menthe foncé, texte blanc gras ; colonnes numériques alignées à droite. */
export function styliserEnTeteExcel(row: LigneXL, estNumerique: (col: number) => boolean): void {
  row.height = 20
  row.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: XL.blanc } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheFonce } }
    cell.alignment = { vertical: 'middle', horizontal: estNumerique(col) ? 'right' : 'left' }
  })
}

/** Zébrure : une ligne de données sur deux (index impair) en menthe très claire (FILL uniquement). */
export function zebrerLigne(row: LigneXL, index: number): void {
  if (index % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheTint } }
    })
  }
}

/** Ligne TOTAL : gras menthe, fond menthe clair, filet supérieur menthe marqué. */
export function styliserTotalExcel(row: LigneXL): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: XL.mentheFonce } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheTint } }
    cell.border = { top: { style: 'medium', color: { argb: XL.menthe } } }
  })
}

/** Format nombre (#,##0) + alignement à droite sur une cellule (montants). Ne change pas la valeur. */
export function formaterMontantCellule(cell: CelluleXL): void {
  cell.numFmt = '#,##0'
  cell.alignment = { horizontal: 'right' }
}
