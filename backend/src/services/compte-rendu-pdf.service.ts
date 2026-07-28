import PDFDocument from 'pdfkit'
import { type Langue, formatDateHeure } from '../lib/i18n'
import { NK, enteteDocument } from './export-style'

/**
 * PDF du COMPTE-RENDU d'une réunion (§ vie associative) — RÉUTILISE le style premium
 * « Menthe & Encre » (`export-style.ts` : `enteteDocument`, palette assombrie impression). PAS de
 * Puppeteer (aucun chromium sur Railway).
 *
 * Contrairement au reçu, le compte-rendu est MUTABLE (le secrétaire l'édite jusqu'à validation) :
 * on le régénère À LA VOLÉE à chaque téléchargement — aucun stockage Blob, aucune idempotence à
 * tenir. Le rendu emploie l'API FLUX de PDFKit (`doc.text` sans coordonnées) qui gère seul le retour
 * à la ligne ET le saut de page, indispensable pour des notes / un compte-rendu de longueur libre.
 *
 * Fonction PURE (données + langue en entrée) → testable sans DB.
 */

export interface CompteRenduPoint {
  titre: string
  notes: string | null
}
export interface CompteRenduResolution {
  texte: string
  statut: string
  dateVote: Date | null
}
export interface DonneesCompteRenduPdf {
  date: Date
  lieu: string
  type: string
  statut: string
  points: CompteRenduPoint[]
  resolutions: CompteRenduResolution[]
  compteRenduTexte: string | null
}

const TYPE_LABEL: Record<Langue, Record<string, string>> = {
  FR: { ORDINAIRE: 'Ordinaire', EXTRAORDINAIRE: 'Extraordinaire' },
  EN: { ORDINAIRE: 'Ordinary', EXTRAORDINAIRE: 'Extraordinary' },
}
const STATUT_REUNION_LABEL: Record<Langue, Record<string, string>> = {
  FR: { PLANIFIEE: 'Planifiée', TENUE: 'Tenue', ANNULEE: 'Annulée' },
  EN: { PLANIFIEE: 'Planned', TENUE: 'Held', ANNULEE: 'Cancelled' },
}
const STATUT_RESOLUTION_LABEL: Record<Langue, Record<string, string>> = {
  FR: { ADOPTEE: 'Adoptée', REJETEE: 'Rejetée', REPORTEE: 'Reportée' },
  EN: { ADOPTEE: 'Adopted', REJETEE: 'Rejected', REPORTEE: 'Postponed' },
}
const label = (
  map: Record<Langue, Record<string, string>>,
  cle: string,
  langue: Langue,
): string => map[langue][cle] ?? cle

/** Génère le PDF (Buffer) du compte-rendu. */
export function genererCompteRenduPdf(
  donnees: DonneesCompteRenduPdf,
  langue: Langue = 'FR',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const GAUCHE = 40
    const DROITE = 555
    const LARGEUR = DROITE - GAUCHE
    const EN = langue === 'EN'

    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: EN ? 'Meeting minutes' : 'Compte-rendu de réunion',
      meta: `${formatDateHeure(donnees.date, langue)}  ·  ${label(TYPE_LABEL, donnees.type, langue)}  ·  ${donnees.lieu}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    // Bascule sur l'API FLUX : PDFKit gère le wrapping + la pagination à partir d'ici.
    doc.x = GAUCHE
    doc.y = yStart + 4

    const titreSection = (texte: string): void => {
      if (doc.y + 30 > doc.page.height - 42) doc.addPage()
      doc.moveDown(0.6)
      doc.fillColor(NK.mentheFonce).font('Helvetica-Bold').fontSize(12).text(texte, GAUCHE, doc.y, { width: LARGEUR })
      doc
        .moveTo(GAUCHE, doc.y + 2)
        .lineTo(DROITE, doc.y + 2)
        .lineWidth(0.5)
        .strokeColor(NK.filet)
        .stroke()
      doc.moveDown(0.4)
    }
    const corps = (texte: string): void => {
      doc.fillColor(NK.encre).font('Helvetica').fontSize(10.5).text(texte, GAUCHE, doc.y, { width: LARGEUR })
    }
    const sourdine = (texte: string): void => {
      doc.fillColor(NK.gris).font('Helvetica-Oblique').fontSize(10).text(texte, GAUCHE, doc.y, { width: LARGEUR })
    }

    // Statut de la réunion.
    titreSection(EN ? 'Status' : 'Statut')
    corps(label(STATUT_REUNION_LABEL, donnees.statut, langue))

    // Ordre du jour (points ordonnés + notes éventuelles).
    titreSection(EN ? 'Agenda' : 'Ordre du jour')
    if (donnees.points.length === 0) {
      sourdine(EN ? 'No agenda item.' : 'Aucun point à l’ordre du jour.')
    } else {
      donnees.points.forEach((p, i) => {
        doc
          .fillColor(NK.encre)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(`${i + 1}. ${p.titre}`, GAUCHE, doc.y, { width: LARGEUR })
        if (p.notes && p.notes.trim()) {
          doc
            .fillColor(NK.gris)
            .font('Helvetica')
            .fontSize(10)
            .text(p.notes, GAUCHE + 14, doc.y, { width: LARGEUR - 14 })
        }
        doc.moveDown(0.3)
      })
    }

    // Résolutions (texte + statut + date de vote).
    titreSection(EN ? 'Resolutions' : 'Résolutions')
    if (donnees.resolutions.length === 0) {
      sourdine(EN ? 'No resolution.' : 'Aucune résolution.')
    } else {
      donnees.resolutions.forEach((r) => {
        doc.fillColor(NK.encre).font('Helvetica').fontSize(10.5).text(r.texte, GAUCHE, doc.y, { width: LARGEUR })
        const meta = [
          `${EN ? 'Outcome' : 'Décision'} : ${label(STATUT_RESOLUTION_LABEL, r.statut, langue)}`,
          r.dateVote ? `${EN ? 'Vote date' : 'Date du vote'} : ${formatDateHeure(r.dateVote, langue)}` : null,
        ]
          .filter(Boolean)
          .join('  ·  ')
        doc.fillColor(NK.gris).font('Helvetica-Oblique').fontSize(9).text(meta, GAUCHE + 14, doc.y, { width: LARGEUR - 14 })
        doc.moveDown(0.3)
      })
    }

    // Compte-rendu rédigé.
    titreSection(EN ? 'Minutes' : 'Compte-rendu')
    if (donnees.compteRenduTexte && donnees.compteRenduTexte.trim()) {
      corps(donnees.compteRenduTexte)
    } else {
      sourdine(EN ? 'No minutes recorded.' : 'Aucun compte-rendu rédigé.')
    }

    doc.end()
  })
}
