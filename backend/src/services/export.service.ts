/**
 * Service Export des contributions — NKONI, §5 point 9 (matrice §2, ligne « Export »).
 *
 * Deux responsabilités clairement séparées (testables indépendamment) :
 *   1. ASSEMBLAGE des données (`assemblerDonneesContributions`) : requête Prisma isolée
 *      (mockable) → structure `DonneesExport` neutre (lignes triées + totaux). Aucun
 *      couplage au format de sortie.
 *   2. FORMATAGE (`genererExcel`, `genererPdf`) : fonctions pures `DonneesExport → Buffer`,
 *      sans aucun accès base. exceljs pour le .xlsx, PDFKit pour le .pdf (choix §1 :
 *      PDFKit plutôt que Puppeteer — pas de Chromium à embarquer).
 *
 * L'export est en lecture seule ; il ne modifie jamais aucune donnée.
 */

import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { formatMontant, formatDateHeure, type Langue, type Devise } from '../lib/i18n'

/* -------------------------------------------------------------------------- */
/* Structure neutre                                                           */
/* -------------------------------------------------------------------------- */

export interface FiltresExport {
  annee?: number
  membreId?: string
}

export interface LigneExport {
  membreId: string
  nom: string
  prenom: string
  annee: number
  montantAttendu: number
  montantVerse: number
  montantValorise: number
}

export interface TotauxExport {
  montantAttendu: number
  montantVerse: number
  montantValorise: number
}

export interface DonneesExport {
  genereLe: Date
  filtres: FiltresExport
  lignes: LigneExport[]
  totaux: TotauxExport
}

/* -------------------------------------------------------------------------- */
/* Assemblage (Prisma isolé, mockable)                                        */
/* -------------------------------------------------------------------------- */

export interface ExportPrisma {
  contribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
  }
}

/**
 * Charge les contributions (filtrées par année et/ou membre) et construit la structure
 * d'export : lignes triées (nom, prénom, année) + totaux. Le tri est fait côté service
 * pour ne pas dépendre d'un `orderBy` sur relation.
 *
 * @param now Injecté pour les tests (horodatage `genereLe` de l'export).
 */
export async function assemblerDonneesContributions(
  prisma: ExportPrisma,
  filtres: FiltresExport,
  now: Date = new Date(),
): Promise<DonneesExport> {
  const where: Record<string, unknown> = {}
  if (filtres.annee !== undefined) where.annee = filtres.annee
  if (filtres.membreId !== undefined) where.membreId = filtres.membreId

  const contributions = await prisma.contribution.findMany({
    where,
    select: {
      membreId: true,
      annee: true,
      montantAttendu: true,
      montantVerse: true,
      montantValorise: true,
      membre: { select: { nom: true, prenom: true } },
    },
  })

  const lignes: LigneExport[] = contributions.map((c) => ({
    membreId: c.membreId,
    nom: c.membre?.nom ?? '',
    prenom: c.membre?.prenom ?? '',
    annee: c.annee,
    montantAttendu: c.montantAttendu,
    montantVerse: c.montantVerse,
    montantValorise: c.montantValorise,
  }))

  lignes.sort(
    (a, b) =>
      a.nom.localeCompare(b.nom) ||
      a.prenom.localeCompare(b.prenom) ||
      a.annee - b.annee,
  )

  const totaux = lignes.reduce<TotauxExport>(
    (acc, l) => ({
      montantAttendu: acc.montantAttendu + l.montantAttendu,
      montantVerse: acc.montantVerse + l.montantVerse,
      montantValorise: acc.montantValorise + l.montantValorise,
    }),
    { montantAttendu: 0, montantVerse: 0, montantValorise: 0 },
  )

  return { genereLe: now, filtres, lignes, totaux }
}

/* -------------------------------------------------------------------------- */
/* Formatage — libellés partagés                                              */
/* -------------------------------------------------------------------------- */

const COLONNES = [
  { header: 'Nom', key: 'nom' as const, width: 22 },
  { header: 'Prénom', key: 'prenom' as const, width: 22 },
  { header: 'Année', key: 'annee' as const, width: 10 },
  { header: 'Montant attendu', key: 'montantAttendu' as const, width: 18 },
  { header: 'Montant versé', key: 'montantVerse' as const, width: 18 },
  { header: 'Montant valorisé', key: 'montantValorise' as const, width: 18 },
]

/** Colonnes portant un montant → alignées à DROITE + format nombre (cohérent avec `.num` du web). */
const COLS_MONTANT = new Set<string>(['montantAttendu', 'montantVerse', 'montantValorise'])

/**
 * Palette de marque « Menthe & Encre » convertie en sRGB pour PDFKit/Excel. Les jetons oklch du
 * front sont rendus pour un fond BLANC d'IMPRESSION : teintes menthe/or plus PROFONDES que la
 * version dark-mode du web, afin de garder un contraste suffisant sans gâcher l'encre (tâche §5.9,
 * point 4). Conversions exactes oklch→sRGB (cf. jetons `src/index.css`) :
 *   menthe      #009b66  ← --emerald-deep oklch(0.60 0.15 163)   titre + accents
 *   mentheFonce #006a48  ← menthe assombrie   oklch(0.46 0.11 165) bandeau d'en-tête (texte blanc)
 *   mentheTint  #e9f8f0  ← menthe très claire oklch(0.965 0.018 165) zébrure / fond TOTAL
 *   or          #a28137  ← --amber assombri   oklch(0.62 0.10 85)  filet décoratif sous le titre
 *   encre       #222b2b  ← proche --canvas, foncée sur blanc      texte courant
 *   gris        #636a6d                                            sous-titre discret
 *   filet       #d5d8d9                                            filets fins entre lignes
 */
const NK = {
  menthe: '#009b66',
  mentheFonce: '#006a48',
  mentheTint: '#e9f8f0',
  or: '#a28137',
  encre: '#222b2b',
  gris: '#636a6d',
  filet: '#d5d8d9',
  blanc: '#ffffff',
} as const

/** Variante ARGB (préfixe alpha « FF ») pour ExcelJS, dérivée des mêmes teintes. */
const XL = {
  mentheFonce: 'FF006A48',
  mentheTint: 'FFE9F8F0',
  menthe: 'FF009B66',
  blanc: 'FFFFFFFF',
} as const

function libelleFiltres(filtres: FiltresExport): string {
  const parts: string[] = []
  parts.push(filtres.annee !== undefined ? `Année ${filtres.annee}` : 'Toutes années')
  if (filtres.membreId !== undefined) parts.push(`Membre ${filtres.membreId}`)
  return parts.join(' — ')
}

/* -------------------------------------------------------------------------- */
/* Formatage Excel (exceljs)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Formate les données en classeur .xlsx (Buffer). Fonction pure (aucun accès base). Les montants
 * restent des NOMBRES (calculables, triables) avec un format d'affichage `#,##0` + alignement à
 * droite ; seule l'apparence change. En-tête figé + bandeau menthe, zébrure, ligne TOTAL soulignée.
 */
export async function genererExcel(donnees: DonneesExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = donnees.genereLe

  // En-tête figé au défilement (confort de lecture des grands exports).
  const ws = wb.addWorksheet('Contributions', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLONNES.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  // Ligne d'en-tête : bandeau menthe foncé, texte blanc gras ; montants alignés à droite.
  const enTete = ws.getRow(1)
  enTete.height = 20
  COLONNES.forEach((c, idx) => {
    const cell = enTete.getCell(idx + 1)
    cell.font = { bold: true, color: { argb: XL.blanc } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheFonce } }
    cell.alignment = { vertical: 'middle', horizontal: COLS_MONTANT.has(c.key) ? 'right' : 'left' }
  })

  donnees.lignes.forEach((l, i) => {
    const row = ws.addRow({
      nom: l.nom,
      prenom: l.prenom,
      annee: l.annee,
      montantAttendu: l.montantAttendu,
      montantVerse: l.montantVerse,
      montantValorise: l.montantValorise,
    })
    const zebra = i % 2 === 1 // zébrure : une ligne sur deux en menthe très claire
    COLONNES.forEach((c, idx) => {
      const cell = row.getCell(idx + 1)
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheTint } }
      if (COLS_MONTANT.has(c.key)) {
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right' }
      }
    })
  })

  // Ligne de totaux : gras menthe, fond menthe clair, filet supérieur menthe marqué.
  const ligneTotal = ws.addRow({
    nom: 'TOTAL',
    montantAttendu: donnees.totaux.montantAttendu,
    montantVerse: donnees.totaux.montantVerse,
    montantValorise: donnees.totaux.montantValorise,
  })
  COLONNES.forEach((c, idx) => {
    const cell = ligneTotal.getCell(idx + 1)
    cell.font = { bold: true, color: { argb: XL.mentheFonce } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.mentheTint } }
    cell.border = { top: { style: 'medium', color: { argb: XL.menthe } } }
    if (COLS_MONTANT.has(c.key)) {
      cell.numFmt = '#,##0'
      cell.alignment = { horizontal: 'right' }
    }
  })

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* Formatage PDF (PDFKit)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Formate les données en document .pdf (Buffer). Fonction pure (aucun accès base).
 *
 * Identité « Menthe & Encre » sur fond blanc (impression) : titre menthe, filet or, bandeau
 * d'en-tête menthe foncé à texte blanc, corps zébré à filets fins, ligne TOTAL soulignée. Montants
 * formatés (langue + devise) et alignés à DROITE. Date « Généré le » lisible et localisée (plus
 * d'ISO brut). `langue`/`devise` optionnels (défaut FR/FCFA) pour rester rétrocompatible.
 */
export function genererPdf(
  donnees: DonneesExport,
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const GAUCHE = 40
    const DROITE = 555 // A4 = 595 pt de large, moins la marge de 40
    const LARGEUR = DROITE - GAUCHE
    const BAS = 800 // limite basse avant saut de page (A4 = 842 pt)
    const H = 20 // hauteur de ligne
    const PAD = 6

    // Colonnes : bord gauche `x`, largeur `w`, alignement. Montants à droite. `as const` → tuple
    // (indexation typée sans `undefined`).
    const COLS = [
      { key: 'nom', label: 'Nom', x: 40, w: 110, align: 'left' },
      { key: 'prenom', label: 'Prénom', x: 150, w: 95, align: 'left' },
      { key: 'annee', label: 'Année', x: 245, w: 45, align: 'left' },
      { key: 'montantAttendu', label: 'Montant attendu', x: 290, w: 88, align: 'right' },
      { key: 'montantVerse', label: 'Montant versé', x: 378, w: 88, align: 'right' },
      { key: 'montantValorise', label: 'Montant valorisé', x: 466, w: 89, align: 'right' },
    ] as const

    // Montant formaté pour PDFKit : `Intl` emploie une ESPACE FINE INSÉCABLE (U+202F) comme
    // séparateur de milliers et avant le symbole ; la police Helvetica intégrée de PDFKit ne
    // l'encode pas (rendue « / »). On la remplace (ainsi que l'insécable U+00A0) par une espace
    // normale → « 10 000 FCFA » lisible. (L'Excel garde des nombres, non concerné.)
    const montant = (n: number): string =>
      formatMontant(n, langue, devise).replace(/[\u202f\u00a0]/g, ' ')

    // Écrit une cellule alignée dans sa colonne (gap PAD sur le côté « intérieur »).
    const cellule = (texte: string, col: (typeof COLS)[number], y: number): void => {
      const x = col.align === 'right' ? col.x : col.x + PAD
      doc.text(texte, x, y, { width: col.w - PAD, align: col.align, lineBreak: false })
    }

    // Bandeau d'en-tête de colonnes (menthe foncé, texte blanc). Renvoie le y du corps.
    const dessinerEnTete = (y: number): number => {
      doc.rect(GAUCHE, y, LARGEUR, H + 2).fill(NK.mentheFonce)
      doc.fillColor(NK.blanc).font('Helvetica-Bold').fontSize(8.5)
      for (const col of COLS) cellule(col.label, col, y + 6)
      return y + H + 2
    }

    // ── Titre + méta ──────────────────────────────────────────────────────
    doc.fillColor(NK.menthe).font('Helvetica-Bold').fontSize(18).text('NKONI', GAUCHE, 42)
    doc
      .fillColor(NK.encre)
      .font('Helvetica')
      .fontSize(11)
      .text('Export des contributions', GAUCHE, 67)
    doc
      .fillColor(NK.gris)
      .fontSize(9)
      .text(
        `${libelleFiltres(donnees.filtres)}  ·  Généré le ${formatDateHeure(donnees.genereLe, langue)}`,
        GAUCHE,
        85,
      )
    doc.moveTo(GAUCHE, 105).lineTo(DROITE, 105).lineWidth(1.5).strokeColor(NK.or).stroke()

    // ── Tableau ─────────────────────────────────────────────────────────────
    let y = dessinerEnTete(117)
    doc.font('Helvetica').fontSize(9)

    donnees.lignes.forEach((l, i) => {
      if (y + H > BAS) {
        doc.addPage()
        y = dessinerEnTete(40)
        doc.font('Helvetica').fontSize(9)
      }
      if (i % 2 === 1) doc.rect(GAUCHE, y, LARGEUR, H).fill(NK.mentheTint) // zébrure
      doc.fillColor(NK.encre)
      cellule(l.nom, COLS[0], y + 6)
      cellule(l.prenom, COLS[1], y + 6)
      cellule(String(l.annee), COLS[2], y + 6)
      cellule(montant(l.montantAttendu), COLS[3], y + 6)
      cellule(montant(l.montantVerse), COLS[4], y + 6)
      cellule(montant(l.montantValorise), COLS[5], y + 6)
      doc.moveTo(GAUCHE, y + H).lineTo(DROITE, y + H).lineWidth(0.5).strokeColor(NK.filet).stroke()
      y += H
    })

    // ── Ligne TOTAL ───────────────────────────────────────────────────────
    if (y + H > BAS) {
      doc.addPage()
      y = 40
    }
    doc.rect(GAUCHE, y, LARGEUR, H + 2).fill(NK.mentheTint)
    doc.moveTo(GAUCHE, y).lineTo(DROITE, y).lineWidth(1.5).strokeColor(NK.menthe).stroke()
    doc.fillColor(NK.mentheFonce).font('Helvetica-Bold').fontSize(9.5)
    cellule('TOTAL', COLS[0], y + 6)
    cellule(montant(donnees.totaux.montantAttendu), COLS[3], y + 6)
    cellule(montant(donnees.totaux.montantVerse), COLS[4], y + 6)
    cellule(montant(donnees.totaux.montantValorise), COLS[5], y + 6)

    doc.end()
  })
}
