import { describe, it, expect } from 'vitest'
import PDFDocument from 'pdfkit'
import { tailleAjustee } from '../src/services/carte.service'

/**
 * Garde du correctif « nom composé tronqué sur la carte » : `tailleAjustee` doit RÉTRÉCIR la police
 * jusqu'à ce que le texte tienne dans la largeur, au lieu de laisser tronquer en « DEMANOU… ».
 * Mesure réelle via PDFKit (la largeur dépend de la police posée sur le document).
 */
describe('carte — tailleAjustee (ajustement du nom à la largeur)', () => {
  const doc = new PDFDocument()
  doc.font('Helvetica-Bold')

  it('garde la taille max quand le texte tient déjà', () => {
    // « DJOUMESSI » à 13pt tient largement dans 91pt (la colonne texte de la carte).
    expect(tailleAjustee(doc, 'DJOUMESSI', 91, 13, 8)).toBe(13)
  })

  it('rétrécit un nom composé qui déborderait (« DEMANOU KENGO »)', () => {
    const taille = tailleAjustee(doc, 'DEMANOU KENGO', 91, 13, 8)
    expect(taille).toBeLessThan(13)
    expect(taille).toBeGreaterThanOrEqual(8)
    // Et à cette taille, le texte tient effectivement dans la largeur.
    expect(doc.fontSize(taille).widthOfString('DEMANOU KENGO')).toBeLessThanOrEqual(91)
  })

  it('ne descend jamais sous le plancher, même pour un texte extrême', () => {
    expect(tailleAjustee(doc, 'NOM-EXTREMEMENT-LONG-QUI-NE-TIENDRA-JAMAIS', 91, 13, 8)).toBe(8)
  })
})
