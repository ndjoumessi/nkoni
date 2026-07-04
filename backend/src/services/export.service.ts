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

function libelleFiltres(filtres: FiltresExport): string {
  const parts: string[] = []
  parts.push(filtres.annee !== undefined ? `Année ${filtres.annee}` : 'Toutes années')
  if (filtres.membreId !== undefined) parts.push(`Membre ${filtres.membreId}`)
  return parts.join(' — ')
}

/* -------------------------------------------------------------------------- */
/* Formatage Excel (exceljs)                                                  */
/* -------------------------------------------------------------------------- */

/** Formate les données en classeur .xlsx (Buffer). Fonction pure (aucun accès base). */
export async function genererExcel(donnees: DonneesExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = donnees.genereLe

  const ws = wb.addWorksheet('Contributions')
  ws.columns = COLONNES.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  ws.getRow(1).font = { bold: true }

  for (const l of donnees.lignes) {
    ws.addRow({
      nom: l.nom,
      prenom: l.prenom,
      annee: l.annee,
      montantAttendu: l.montantAttendu,
      montantVerse: l.montantVerse,
      montantValorise: l.montantValorise,
    })
  }

  // Ligne de totaux (en gras).
  const ligneTotal = ws.addRow({
    nom: 'TOTAL',
    montantAttendu: donnees.totaux.montantAttendu,
    montantVerse: donnees.totaux.montantVerse,
    montantValorise: donnees.totaux.montantValorise,
  })
  ligneTotal.font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* Formatage PDF (PDFKit)                                                     */
/* -------------------------------------------------------------------------- */

/** Formate les données en document .pdf (Buffer). Fonction pure (aucun accès base). */
export function genererPdf(donnees: DonneesExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // En-tête.
    doc.font('Helvetica-Bold').fontSize(16).text('NKONI — Export des contributions', {
      align: 'center',
    })
    doc.moveDown(0.3)
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`${libelleFiltres(donnees.filtres)}  ·  Généré le ${donnees.genereLe.toISOString()}`, {
        align: 'center',
      })
    doc.moveDown(1)

    // Disposition en colonnes à x fixes.
    const xs = [40, 150, 250, 310, 400, 480]
    const enTetes = COLONNES.map((c) => c.header)

    const ecrireLigne = (valeurs: (string | number)[], gras: boolean): void => {
      doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      const y = doc.y
      valeurs.forEach((v, i) => {
        const x = xs[i] ?? 40 // xs a exactement 6 entrées (== nb de colonnes)
        doc.text(String(v), x, y, { width: (xs[i + 1] ?? 555) - x - 4, lineBreak: false })
      })
      doc.moveDown(0.6)
    }

    ecrireLigne(enTetes, true)
    for (const l of donnees.lignes) {
      ecrireLigne(
        [l.nom, l.prenom, l.annee, l.montantAttendu, l.montantVerse, l.montantValorise],
        false,
      )
    }
    ecrireLigne(
      [
        'TOTAL',
        '',
        '',
        donnees.totaux.montantAttendu,
        donnees.totaux.montantVerse,
        donnees.totaux.montantValorise,
      ],
      true,
    )

    doc.end()
  })
}
