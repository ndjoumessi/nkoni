import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { NK } from './export-style'
import type { Langue } from '../lib/i18n'

/**
 * Cartes de membre IMPRIMABLES (§4.7) — PDF, identité « Menthe & Encre » (palette impression sur
 * blanc). Chaque carte porte l'identité du membre + un QR code renvoyant vers la page PUBLIQUE de
 * vérification de statut (`GET /membres/:id/statut-public?t=…`) : scanner la carte affiche, en
 * direct, « à jour / partiel / non à jour » — SANS montants. Génération unitaire ou en LOT (grille
 * découpable sur A4). Fonction PURE (données → Buffer), testable sans DB.
 */

export interface DonneesCarte {
  id: string
  nom: string
  prenom: string
  branche: string | null
  anneeAdhesion: number
  /** URL absolue publique de vérification de statut, encodée dans le QR. */
  qrUrl: string
}

interface LibellesCarte {
  organisation: string
  carte: string
  branche: string
  depuis: string
  scanner: string
}

function libelles(nomOrganisation: string, langue: Langue): LibellesCarte {
  return langue === 'EN'
    ? { organisation: nomOrganisation, carte: 'MEMBER CARD', branche: 'Branch', depuis: 'Member since', scanner: 'Scan to check status' }
    : { organisation: nomOrganisation, carte: 'CARTE DE MEMBRE', branche: 'Branche', depuis: 'Membre depuis', scanner: 'Scanner pour vérifier le statut' }
}

// Dimensions carte bancaire (85,6 × 54 mm) en points PDF ; grille A4 découpable.
const CARD_W = 243
const CARD_H = 153
const PAGE_W = 595
const PAGE_H = 842
const MARGE = 30
const GAP = 16
const COLS = 2

/** Dessine UNE carte à l'origine (x, y). `qr` = PNG du QR déjà rendu. */
function dessinerCarte(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  d: DonneesCarte,
  qr: Buffer,
  L: LibellesCarte,
): void {
  const pad = 14
  // Cadre (repère de découpe) + liseré menthe fin.
  doc.roundedRect(x, y, CARD_W, CARD_H, 10).lineWidth(1).strokeColor(NK.menthe).stroke()

  // En-tête : organisation (menthe) + filet or + label « CARTE DE MEMBRE » (or).
  doc.fillColor(NK.menthe).font('Helvetica-Bold').fontSize(12)
    .text(L.organisation, x + pad, y + pad, { width: CARD_W - pad * 2, lineBreak: false, ellipsis: true })
  doc.moveTo(x + pad, y + pad + 20).lineTo(x + CARD_W - pad, y + pad + 20).lineWidth(1).strokeColor(NK.or).stroke()
  doc.fillColor(NK.or).font('Helvetica-Bold').fontSize(7)
    .text(L.carte, x + pad, y + pad + 25, { characterSpacing: 1.2 })

  // Corps : nom (bold) + prénom, branche, année d'adhésion. Zone gauche (le QR occupe la droite).
  const largeurTexte = CARD_W - pad * 2 - 92
  doc.fillColor(NK.encre).font('Helvetica-Bold').fontSize(14)
    .text(d.nom.toUpperCase(), x + pad, y + 60, { width: largeurTexte, lineBreak: false, ellipsis: true })
  doc.fillColor(NK.encre).font('Helvetica').fontSize(12)
    .text(d.prenom, x + pad, y + 78, { width: largeurTexte, lineBreak: false, ellipsis: true })

  doc.fillColor(NK.gris).font('Helvetica').fontSize(8)
  if (d.branche) doc.text(`${L.branche} : ${d.branche}`, x + pad, y + 104, { width: largeurTexte, lineBreak: false, ellipsis: true })
  doc.text(`${L.depuis} ${d.anneeAdhesion}`, x + pad, y + 118, { width: largeurTexte, lineBreak: false })

  // QR (bas-droite) + légende.
  const qrSize = 78
  const qrX = x + CARD_W - pad - qrSize
  const qrY = y + CARD_H - pad - qrSize - 8
  doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize })
  doc.fillColor(NK.gris).font('Helvetica').fontSize(5.5)
    .text(L.scanner, qrX - 6, qrY + qrSize + 1, { width: qrSize + 12, align: 'center', lineBreak: false })
}

/**
 * Génère le PDF des cartes (1 = carte centrée ; N = grille découpable sur A4).
 * `nomOrganisation` en tête de chaque carte ; `langue` pilote les libellés.
 */
export async function genererCartesPdf(
  cartes: DonneesCarte[],
  nomOrganisation: string,
  langue: Langue = 'FR',
): Promise<Buffer> {
  const L = libelles(nomOrganisation, langue)
  // Pré-rendu des QR (PNG) — une passe async, avant le dessin synchrone du PDF.
  const qrs = await Promise.all(
    cartes.map((c) => QRCode.toBuffer(c.qrUrl, { margin: 0, width: 220, errorCorrectionLevel: 'M' })),
  )

  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGE })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    if (cartes.length === 1) {
      const carte = cartes[0]!
      const x = (PAGE_W - CARD_W) / 2
      const y = (PAGE_H - CARD_H) / 2
      dessinerCarte(doc, x, y, carte, qrs[0]!, L)
    } else {
      const rows = Math.max(1, Math.floor((PAGE_H - MARGE * 2 + GAP) / (CARD_H + GAP)))
      const parPage = COLS * rows
      cartes.forEach((carte, i) => {
        const posDansPage = i % parPage
        if (i > 0 && posDansPage === 0) doc.addPage()
        const col = posDansPage % COLS
        const row = Math.floor(posDansPage / COLS)
        const x = MARGE + col * (CARD_W + GAP)
        const y = MARGE + row * (CARD_H + GAP)
        dessinerCarte(doc, x, y, carte, qrs[i]!, L)
      })
    }
    doc.end()
  })
}
