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
import { formatDateHeure, type Langue, type Devise } from '../lib/i18n'
import { libellesExport } from './export-libelles'
import {
  enteteDocument,
  dessinerCorpsPremium,
  montantExport,
  neutraliserFormuleCellule,
  styliserEnTeteExcel,
  zebrerLigne,
  styliserTotalExcel,
  formaterMontantCellule,
  type ColonnePremium,
} from './export-style'

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

/** Colonnes de l'export, libellées dans la langue de l'exportateur (clés et largeurs invariantes). */
const colonnesExport = (langue: Langue) => {
  const L = libellesExport(langue)
  return [
    { header: L.nom, key: 'nom' as const, width: 22 },
    { header: L.prenom, key: 'prenom' as const, width: 22 },
    { header: L.annee, key: 'annee' as const, width: 10 },
    { header: L.montantAttendu, key: 'montantAttendu' as const, width: 18 },
    { header: L.montantVerse, key: 'montantVerse' as const, width: 18 },
    { header: L.montantValorise, key: 'montantValorise' as const, width: 18 },
  ]
}

/** Ordre des clés de colonnes — seul élément dont dépendent l'alignement et le format des montants. */
const CLES_COLONNES = [
  'nom',
  'prenom',
  'annee',
  'montantAttendu',
  'montantVerse',
  'montantValorise',
] as const

/** Colonnes portant un montant → alignées à DROITE + format nombre (cohérent avec `.num` du web). */
const COLS_MONTANT = new Set<string>(['montantAttendu', 'montantVerse', 'montantValorise'])

/** Une colonne est-elle un montant ? (1-based, pour styliser l'en-tête/les cellules Excel.) */
const colEstMontant = (col: number): boolean => COLS_MONTANT.has(CLES_COLONNES[col - 1] ?? '')

function libelleFiltres(filtres: FiltresExport, langue: Langue): string {
  const L = libellesExport(langue)
  const parts: string[] = []
  parts.push(filtres.annee !== undefined ? `${L.annee} ${filtres.annee}` : L.toutesAnnees)
  if (filtres.membreId !== undefined) parts.push(`${L.membre} ${filtres.membreId}`)
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
export async function genererExcel(
  donnees: DonneesExport,
  langue: Langue = 'FR',
): Promise<Buffer> {
  const L = libellesExport(langue)
  const colonnes = colonnesExport(langue)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = donnees.genereLe

  // En-tête figé au défilement (confort de lecture des grands exports).
  const ws = wb.addWorksheet(L.contributionsFeuille, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = colonnes.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  styliserEnTeteExcel(ws.getRow(1), colEstMontant)

  const formaterMontants = (row: ExcelJS.Row): void => {
    colonnes.forEach((c, idx) => {
      if (COLS_MONTANT.has(c.key)) formaterMontantCellule(row.getCell(idx + 1))
    })
  }

  donnees.lignes.forEach((l, i) => {
    const row = ws.addRow({
      // Noms saisis par les utilisateurs → neutraliser toute injection de formule (audit Sécu E2).
      nom: neutraliserFormuleCellule(l.nom),
      prenom: neutraliserFormuleCellule(l.prenom),
      annee: l.annee,
      montantAttendu: l.montantAttendu,
      montantVerse: l.montantVerse,
      montantValorise: l.montantValorise,
    })
    zebrerLigne(row, i)
    formaterMontants(row)
  })

  const ligneTotal = ws.addRow({
    nom: L.total,
    montantAttendu: donnees.totaux.montantAttendu,
    montantVerse: donnees.totaux.montantVerse,
    montantValorise: donnees.totaux.montantValorise,
  })
  styliserTotalExcel(ligneTotal)
  formaterMontants(ligneTotal)

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
    const m = (n: number): string => montantExport(n, langue, devise)
    const L = libellesExport(langue)

    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: L.contributionsSousTitre,
      meta: `${libelleFiltres(donnees.filtres, langue)}  \u00b7  ${L.genereLe} ${formatDateHeure(donnees.genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    const colonnes: ColonnePremium[] = [
      { label: L.nom, largeur: 110, align: 'left' },
      { label: L.prenom, largeur: 95, align: 'left' },
      { label: L.annee, largeur: 45, align: 'left' },
      { label: L.montantAttendu, largeur: 88, align: 'right' },
      { label: L.montantVerse, largeur: 88, align: 'right' },
      { label: L.montantValorise, largeur: 89, align: 'right' },
    ]
    const lignes = donnees.lignes.map((l) => [
      l.nom,
      l.prenom,
      String(l.annee),
      m(l.montantAttendu),
      m(l.montantVerse),
      m(l.montantValorise),
    ])
    const total = [
      L.total,
      '',
      '',
      m(donnees.totaux.montantAttendu),
      m(donnees.totaux.montantVerse),
      m(donnees.totaux.montantValorise),
    ]

    dessinerCorpsPremium(doc, { colonnes, lignes, total, gauche: GAUCHE, droite: DROITE, yStart })
    doc.end()
  })
}
