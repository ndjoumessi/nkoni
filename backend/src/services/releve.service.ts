import PDFDocument from 'pdfkit'
import {
  NK,
  enteteDocument,
  dessinerCorpsPremium,
  montantExport,
  type ColonnePremium,
} from './export-style'
import { formatDateHeure, type Langue, type Devise } from '../lib/i18n'

/**
 * Relevé de compte membre (§4.8) — PDF « relevé bancaire » des cotisations d'UN membre, identité
 * « Menthe & Encre » (palette impression sur blanc), RÉUTILISE `enteteDocument` +
 * `dessinerCorpsPremium` (aucune duplication de style). Structure : en-tête, bloc de synthèse
 * (attendu / valorisé cumulés, reste à payer, statut), tableau « par année » puis tableau
 * chronologique des « mouvements » (versements). Fonction PURE (données → Buffer), testable
 * sans DB. Locale + devise résolues par l'appelant (route) — comme les reçus/rapports.
 */

export interface LigneAnneeReleve {
  annee: number
  attendu: number
  verse: number
  valorise: number
}

export interface MouvementReleve {
  date: Date
  annee: number
  montant: number
  mode: 'ESPECES' | 'TIERS' | 'AUTRE'
}

export type StatutReleve = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

export interface DonneesReleve {
  organisation: string
  nom: string
  prenom: string
  branche: string | null
  anneeAdhesion: number
  statut: StatutReleve
  totalAttendu: number
  totalValorise: number
  annees: LigneAnneeReleve[]
  mouvements: MouvementReleve[]
  genereLe: Date
}

interface LibellesReleve {
  titre: string
  genereLe: string
  syntheseAttendu: string
  syntheseValorise: string
  syntheseReste: string
  syntheseStatut: string
  statuts: Record<StatutReleve, string>
  modes: Record<MouvementReleve['mode'], string>
  sectionAnnees: string
  sectionMouvements: string
  colAnnee: string
  colAttendu: string
  colVerse: string
  colValorise: string
  colDate: string
  colMontant: string
  colMode: string
  total: string
  aucunMouvement: string
}

function libelles(langue: Langue): LibellesReleve {
  return langue === 'EN'
    ? {
        titre: 'Account statement',
        genereLe: 'Generated on',
        syntheseAttendu: 'Total expected',
        syntheseValorise: 'Total valued',
        syntheseReste: 'Outstanding',
        syntheseStatut: 'Status',
        statuts: { A_JOUR: 'Up to date', PARTIEL: 'Partial', NON_A_JOUR: 'Overdue' },
        modes: { ESPECES: 'Cash', TIERS: 'Third party', AUTRE: 'Other' },
        sectionAnnees: 'By year',
        sectionMouvements: 'Movements',
        colAnnee: 'Year',
        colAttendu: 'Expected',
        colVerse: 'Paid',
        colValorise: 'Valued',
        colDate: 'Date',
        colMontant: 'Amount',
        colMode: 'Method',
        total: 'TOTAL',
        aucunMouvement: 'No payment recorded.',
      }
    : {
        titre: 'Relevé de compte',
        genereLe: 'Généré le',
        syntheseAttendu: 'Total attendu',
        syntheseValorise: 'Total valorisé',
        syntheseReste: 'Reste à payer',
        syntheseStatut: 'Statut',
        statuts: { A_JOUR: 'À jour', PARTIEL: 'Partiel', NON_A_JOUR: 'Non à jour' },
        modes: { ESPECES: 'Espèces', TIERS: 'Tiers', AUTRE: 'Autre' },
        sectionAnnees: 'Par année',
        sectionMouvements: 'Mouvements',
        colAnnee: 'Année',
        colAttendu: 'Attendu',
        colVerse: 'Versé',
        colValorise: 'Valorisé',
        colDate: 'Date',
        colMontant: 'Montant',
        colMode: 'Mode',
        total: 'TOTAL',
        aucunMouvement: 'Aucun versement enregistré.',
      }
}

// Couleur de la valeur « Statut » dans la synthèse (aligné sur la page publique de statut).
const COULEUR_STATUT: Record<StatutReleve, string> = {
  A_JOUR: NK.mentheFonce,
  PARTIEL: NK.or,
  NON_A_JOUR: '#8a2f1c',
}

/** Date courte localisée (sans heure) — pas de séparateur fin problématique pour PDFKit. */
function formatDateCourte(date: Date, langue: Langue): string {
  return new Intl.DateTimeFormat(langue === 'EN' ? 'en' : 'fr', { dateStyle: 'medium' }).format(date)
}

/** Titre de section (menthe foncé, filet or) au-dessus d'un tableau. */
function sectionTitre(doc: PDFKit.PDFDocument, texte: string, gauche: number, droite: number, y: number): number {
  doc.fillColor(NK.mentheFonce).font('Helvetica-Bold').fontSize(11).text(texte, gauche, y)
  const yb = y + 16
  doc.moveTo(gauche, yb).lineTo(gauche + 40, yb).lineWidth(1.5).strokeColor(NK.or).stroke()
  return yb + 8
}

/** Bloc de synthèse : 4 colonnes label/valeur (attendu, valorisé, reste, statut). */
function dessinerSynthese(
  doc: PDFKit.PDFDocument,
  d: DonneesReleve,
  L: LibellesReleve,
  m: (n: number) => string,
  gauche: number,
  droite: number,
  y: number,
): number {
  const H = 56
  const largeur = droite - gauche
  const reste = Math.max(0, d.totalAttendu - d.totalValorise)
  doc.roundedRect(gauche, y, largeur, H, 8).fill(NK.mentheTint)

  const cellules: { label: string; valeur: string; couleur: string }[] = [
    { label: L.syntheseAttendu, valeur: m(d.totalAttendu), couleur: NK.encre },
    { label: L.syntheseValorise, valeur: m(d.totalValorise), couleur: NK.encre },
    { label: L.syntheseReste, valeur: m(reste), couleur: reste > 0 ? '#8a2f1c' : NK.mentheFonce },
    { label: L.syntheseStatut, valeur: L.statuts[d.statut], couleur: COULEUR_STATUT[d.statut] },
  ]
  const colW = largeur / cellules.length
  cellules.forEach((c, i) => {
    const cx = gauche + i * colW + 14
    const cw = colW - 20
    doc.fillColor(NK.gris).font('Helvetica').fontSize(7.5)
      .text(c.label.toUpperCase(), cx, y + 13, { width: cw, characterSpacing: 0.6, lineBreak: false, ellipsis: true })
    doc.fillColor(c.couleur).font('Helvetica-Bold').fontSize(13)
      .text(c.valeur, cx, y + 28, { width: cw, lineBreak: false, ellipsis: true })
  })
  return y + H
}

/**
 * Génère le relevé de compte d'un membre au format PDF (Buffer). Fonction pure.
 */
export function genererRelevePdf(
  d: DonneesReleve,
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  const L = libelles(langue)
  const m = (n: number): string => montantExport(n, langue, devise)

  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const GAUCHE = 40
    const DROITE = 555
    const nomComplet = `${d.prenom} ${d.nom}`.trim()

    let y = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: `${L.titre} — ${nomComplet}`,
      meta: `${d.organisation} · ${L.genereLe} ${formatDateHeure(d.genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    // Synthèse.
    y = dessinerSynthese(doc, d, L, m, GAUCHE, DROITE, y + 4) + 22

    // Tableau « par année ».
    y = sectionTitre(doc, L.sectionAnnees, GAUCHE, DROITE, y)
    const colAnnees: ColonnePremium[] = [
      { label: L.colAnnee, largeur: 130, align: 'left' },
      { label: L.colAttendu, largeur: 128, align: 'right' },
      { label: L.colVerse, largeur: 128, align: 'right' },
      { label: L.colValorise, largeur: 129, align: 'right' },
    ]
    const lignesAnnees = d.annees.map((a) => [String(a.annee), m(a.attendu), m(a.verse), m(a.valorise)])
    const totalAnnees = [
      L.total,
      m(d.annees.reduce((s, a) => s + a.attendu, 0)),
      m(d.annees.reduce((s, a) => s + a.verse, 0)),
      m(d.annees.reduce((s, a) => s + a.valorise, 0)),
    ]
    y = dessinerCorpsPremium(doc, {
      colonnes: colAnnees,
      lignes: lignesAnnees,
      total: totalAnnees,
      gauche: GAUCHE,
      droite: DROITE,
      yStart: y,
    })

    // Tableau « mouvements » (versements chronologiques).
    y += 26
    y = sectionTitre(doc, L.sectionMouvements, GAUCHE, DROITE, y)
    if (d.mouvements.length === 0) {
      doc.fillColor(NK.gris).font('Helvetica').fontSize(9).text(L.aucunMouvement, GAUCHE, y + 2)
    } else {
      const colMvt: ColonnePremium[] = [
        { label: L.colDate, largeur: 190, align: 'left' },
        { label: L.colAnnee, largeur: 95, align: 'left' },
        { label: L.colMode, largeur: 105, align: 'left' },
        { label: L.colMontant, largeur: 125, align: 'right' },
      ]
      const lignesMvt = d.mouvements.map((mv) => [
        formatDateCourte(mv.date, langue),
        String(mv.annee),
        L.modes[mv.mode],
        m(mv.montant),
      ])
      const totalMvt = ['', '', L.total, m(d.mouvements.reduce((s, mv) => s + mv.montant, 0))]
      dessinerCorpsPremium(doc, {
        colonnes: colMvt,
        lignes: lignesMvt,
        total: totalMvt,
        gauche: GAUCHE,
        droite: DROITE,
        yStart: y,
      })
    }

    doc.end()
  })
}
