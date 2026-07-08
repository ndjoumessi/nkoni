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
import {
  enteteDocument,
  dessinerCorpsPremium,
  montantExport,
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

/** Une colonne est-elle un montant ? (1-based, pour styliser l'en-tête/les cellules Excel.) */
const colEstMontant = (col: number): boolean => COLS_MONTANT.has(COLONNES[col - 1]?.key ?? '')

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

  styliserEnTeteExcel(ws.getRow(1), colEstMontant)

  const formaterMontants = (row: ExcelJS.Row): void => {
    COLONNES.forEach((c, idx) => {
      if (COLS_MONTANT.has(c.key)) formaterMontantCellule(row.getCell(idx + 1))
    })
  }

  donnees.lignes.forEach((l, i) => {
    const row = ws.addRow({
      nom: l.nom,
      prenom: l.prenom,
      annee: l.annee,
      montantAttendu: l.montantAttendu,
      montantVerse: l.montantVerse,
      montantValorise: l.montantValorise,
    })
    zebrerLigne(row, i)
    formaterMontants(row)
  })

  const ligneTotal = ws.addRow({
    nom: 'TOTAL',
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

    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: 'Export des contributions',
      meta: `${libelleFiltres(donnees.filtres)}  \u00b7  Généré le ${formatDateHeure(donnees.genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    const colonnes: ColonnePremium[] = [
      { label: 'Nom', largeur: 110, align: 'left' },
      { label: 'Prénom', largeur: 95, align: 'left' },
      { label: 'Année', largeur: 45, align: 'left' },
      { label: 'Montant attendu', largeur: 88, align: 'right' },
      { label: 'Montant versé', largeur: 88, align: 'right' },
      { label: 'Montant valorisé', largeur: 89, align: 'right' },
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
      'TOTAL',
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
