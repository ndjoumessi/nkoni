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
  /** Photo du membre (JPEG/PNG) — avatar sur la carte. Absent → initiales. */
  photo?: Buffer
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
  const bandH = 34
  const radius = 10

  // Fond TEINTÉ (background) — menthe très clair, sobre à l'impression.
  doc.roundedRect(x, y, CARD_W, CARD_H, radius).fill(NK.mentheTint)

  // Bandeau d'en-tête menthe (coins hauts arrondis via clip sur la carte).
  doc.save()
  doc.roundedRect(x, y, CARD_W, CARD_H, radius).clip()
  doc.rect(x, y, CARD_W, bandH).fill(NK.menthe)
  doc.restore()

  // Cadre (repère de découpe).
  doc.roundedRect(x, y, CARD_W, CARD_H, radius).lineWidth(1).strokeColor(NK.menthe).stroke()

  // Organisation dans le bandeau (texte blanc).
  doc.fillColor(NK.blanc).font('Helvetica-Bold').fontSize(12)
    .text(L.organisation, x + pad, y + 11, { width: CARD_W - pad * 2, lineBreak: false, ellipsis: true })

  // AVATAR (colonne gauche du corps) : photo si fournie et valide, sinon initiales sur fond menthe.
  const aw = 46
  const ah = 58
  const ax = x + pad
  const ay = y + bandH + 10
  doc.save()
  doc.roundedRect(ax, ay, aw, ah, 8).clip()
  let photoOk = false
  if (d.photo) {
    try {
      doc.image(d.photo, ax, ay, { cover: [aw, ah], align: 'center', valign: 'center' })
      photoOk = true
    } catch {
      photoOk = false
    }
  }
  if (!photoOk) {
    doc.rect(ax, ay, aw, ah).fill(NK.menthe)
    const initiales = `${d.prenom[0] ?? ''}${d.nom[0] ?? ''}`.toUpperCase()
    doc.fillColor(NK.blanc).font('Helvetica-Bold').fontSize(22)
      .text(initiales, ax, ay + ah / 2 - 13, { width: aw, align: 'center' })
  }
  doc.restore()
  doc.roundedRect(ax, ay, aw, ah, 8).lineWidth(1).strokeColor(NK.menthe).stroke()

  // COLONNE TEXTE à droite de l'avatar. Largeur bornée pour ne pas empiéter sur le QR.
  const tx = ax + aw + 12
  const qrSize = 58
  const qrX = x + CARD_W - pad - qrSize
  const tw = qrX - tx - 8

  // `height` + `ellipsis` force UNE seule ligne tronquée : `lineBreak:false` seul laisse PDFKit
  // couper sur l'espace (« ROMEL NELSON » → 2 lignes qui chevauchent la ligne du dessous).
  doc.fillColor(NK.or).font('Helvetica-Bold').fontSize(7)
    .text(L.carte, tx, y + bandH + 8, { characterSpacing: 1.2, width: tw, height: 11, ellipsis: true })
  doc.fillColor(NK.encre).font('Helvetica-Bold').fontSize(13)
    .text(d.nom.toUpperCase(), tx, y + 57, { width: tw, height: 17, ellipsis: true })
  doc.fillColor(NK.encre).font('Helvetica').fontSize(11)
    .text(d.prenom, tx, y + 75, { width: tw, height: 15, ellipsis: true })

  let ligneY = y + 96
  doc.fillColor(NK.gris).font('Helvetica').fontSize(8)
  if (d.branche) {
    doc.text(`${L.branche} : ${d.branche}`, tx, ligneY, { width: tw, height: 11, ellipsis: true })
    ligneY += 13
  }
  doc.text(`${L.depuis} ${d.anneeAdhesion}`, tx, ligneY, { width: tw, height: 11, ellipsis: true })

  // QR (bas-droite) sur PASTILLE BLANCHE (scannabilité garantie sur fond teinté) + légende.
  const qrY = y + CARD_H - pad - qrSize - 8
  doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 6).fill(NK.blanc)
  doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize })
  doc.fillColor(NK.gris).font('Helvetica').fontSize(5.5)
    .text(L.scanner, qrX - 8, qrY + qrSize + 2, { width: qrSize + 16, align: 'center', lineBreak: false })
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
