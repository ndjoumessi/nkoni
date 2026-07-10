/**
 * Export des RAPPORTS financiers (enrichissement) — PDF / Excel, identité « Menthe & Encre ».
 *
 * Consomme DIRECTEMENT la sortie déjà calculée par `rapport.service` (RapportFinancier /
 * Comparaison…) — aucun agrégat recalculé. Fonctions PURES `données → Buffer`, sans accès base.
 *
 * Réutilise le style d'export partagé (`export-style.ts`) : palette, dates localisées, tableaux
 * premium PDF (titre menthe, filet or, bandeau d'en-tête, zébrure, ligne TOTAL) et styles Excel
 * (bandeau menthe, zébrure, montants alignés à droite). Les montants PDF sont formatés dans la
 * LANGUE + DEVISE de l'utilisateur qui exporte ; l'Excel garde des NOMBRES (calculables).
 *
 * Deux modes, symétriques à l'UI : Évolution (une ligne/année + TOTAL) et Comparaison (métrique ×
 * années, variation colorée vert/rouge dans le .xlsx).
 */

import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { formatDateHeure, type Langue, type Devise } from '../lib/i18n'
import {
  enteteDocument,
  dessinerCorpsPremium,
  montantExport,
  nombreExport,
  pourcentExport,
  styliserEnTeteExcel,
  zebrerLigne,
  styliserTotalExcel,
  formaterMontantCellule,
  type ColonnePremium,
} from './export-style'
import type {
  RapportFinancier,
  ComparaisonPeriodes,
  ComparaisonMulti,
  RapportAnnee,
  VariationsComparaison,
  Variation,
} from './rapport.service'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Couleurs SÉMANTIQUES de variation (ARGB) — distinctes de l'accent menthe : vert = progression,
 * rouge = régression. Conservées pour la mise en forme conditionnelle du .xlsx. */
const COULEUR = { vert: 'FF157A4F', rouge: 'FFB0432A' } as const

/** Libellé d'une variation « apparition » (base 0 → positif) dans les exports (labels FR). */
const LIBELLE_NOUVEAU = 'Nouveau'

function arrondi2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Aligne une cellule à droite sans imposer de format nombre (comptes, taux). */
function alignerDroite(cell: ExcelJS.Cell): void {
  cell.alignment = { horizontal: 'right' }
}

/** Totaux d'une évolution : Σ attendu/collecté (+ taux global pondéré) et Σ des statuts. */
export function totauxEvolution(annees: RapportAnnee[]): {
  totalAttendu: number
  totalCollecte: number
  tauxRecouvrement: number
  aJour: number
  partiel: number
  nonAJour: number
} {
  const totalAttendu = annees.reduce((s, a) => s + a.totalAttendu, 0)
  const totalCollecte = annees.reduce((s, a) => s + a.totalCollecte, 0)
  return {
    totalAttendu,
    totalCollecte,
    tauxRecouvrement: totalAttendu > 0 ? arrondi2((totalCollecte / totalAttendu) * 100) : 0,
    aJour: annees.reduce((s, a) => s + a.membresParStatut.A_JOUR, 0),
    partiel: annees.reduce((s, a) => s + a.membresParStatut.PARTIEL, 0),
    nonAJour: annees.reduce((s, a) => s + a.membresParStatut.NON_A_JOUR, 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Évolution — Excel                                                          */
/* -------------------------------------------------------------------------- */

const COLONNES_EVOLUTION = [
  { header: 'Année', key: 'annee', width: 10 },
  { header: 'Attendu', key: 'attendu', width: 16 },
  { header: 'Collecté', key: 'collecte', width: 16 },
  { header: 'Taux (%)', key: 'taux', width: 12 },
  { header: 'À jour', key: 'aJour', width: 10 },
  { header: 'Partiel', key: 'partiel', width: 10 },
  { header: 'Non à jour', key: 'nonAJour', width: 12 },
] as const

/** Rapport d'évolution → classeur .xlsx (Buffer). Fonction pure. */
export async function genererEvolutionExcel(
  rapport: RapportFinancier,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Évolution', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLONNES_EVOLUTION.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  // En-tête : Année à gauche, toutes les colonnes chiffrées à droite. Attendu/Collecté = montants.
  styliserEnTeteExcel(ws.getRow(1), (col) => col >= 2)
  const styliserChiffres = (row: ExcelJS.Row): void => {
    formaterMontantCellule(row.getCell(2)) // Attendu
    formaterMontantCellule(row.getCell(3)) // Collecté
    ;[4, 5, 6, 7].forEach((c) => alignerDroite(row.getCell(c))) // Taux + comptes (sans arrondir)
  }

  rapport.annees.forEach((a, i) => {
    const row = ws.addRow({
      annee: a.annee,
      attendu: a.totalAttendu,
      collecte: a.totalCollecte,
      taux: a.tauxRecouvrement,
      aJour: a.membresParStatut.A_JOUR,
      partiel: a.membresParStatut.PARTIEL,
      nonAJour: a.membresParStatut.NON_A_JOUR,
    })
    zebrerLigne(row, i)
    styliserChiffres(row)
  })

  const t = totauxEvolution(rapport.annees)
  const ligneTotal = ws.addRow({
    annee: 'TOTAL',
    attendu: t.totalAttendu,
    collecte: t.totalCollecte,
    taux: t.tauxRecouvrement,
    aJour: t.aJour,
    partiel: t.partiel,
    nonAJour: t.nonAJour,
  })
  styliserTotalExcel(ligneTotal)
  styliserChiffres(ligneTotal)

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* Comparaison — Excel (variation colorée)                                    */
/* -------------------------------------------------------------------------- */

interface LigneComparaison {
  label: string
  a: number | null
  b: number | null
  /** undefined = pas de variation pour cette métrique (ex. décomptes) ; null = non calculable. */
  variation?: Variation
  /** La métrique porte-t-elle des MONTANTS (format #,##0) ? */
  montant?: boolean
}

/** Construit les lignes de la table de comparaison (partagé Excel + PDF). */
export function lignesComparaison(comp: ComparaisonPeriodes): LigneComparaison[] {
  const A = comp.rapportA
  const B = comp.rapportB
  return [
    { label: 'Total attendu', a: A?.totalAttendu ?? null, b: B?.totalAttendu ?? null, variation: comp.variations.totalAttendu, montant: true },
    { label: 'Total collecté', a: A?.totalCollecte ?? null, b: B?.totalCollecte ?? null, variation: comp.variations.totalCollecte, montant: true },
    { label: 'Taux de recouvrement (%)', a: A?.tauxRecouvrement ?? null, b: B?.tauxRecouvrement ?? null, variation: comp.variations.tauxRecouvrement },
    { label: 'Membres éligibles', a: A?.membresEligibles ?? null, b: B?.membresEligibles ?? null },
    { label: 'À jour', a: A?.membresParStatut.A_JOUR ?? null, b: B?.membresParStatut.A_JOUR ?? null },
    { label: 'Partiel', a: A?.membresParStatut.PARTIEL ?? null, b: B?.membresParStatut.PARTIEL ?? null },
    { label: 'Non à jour', a: A?.membresParStatut.NON_A_JOUR ?? null, b: B?.membresParStatut.NON_A_JOUR ?? null },
  ]
}

/** Comparaison → classeur .xlsx (Buffer). Variation colorée vert/rouge. Fonction pure. */
export async function genererComparaisonExcel(
  comp: ComparaisonPeriodes,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Comparaison', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Métrique', key: 'metrique', width: 26 },
    { header: String(comp.anneeA), key: 'a', width: 16 },
    { header: String(comp.anneeB), key: 'b', width: 16 },
    { header: 'Variation (%)', key: 'variation', width: 14 },
  ]
  styliserEnTeteExcel(ws.getRow(1), (col) => col >= 2)

  lignesComparaison(comp).forEach((l, i) => {
    const variationTexte =
      l.variation === undefined
        ? ''
        : l.variation === null
          ? 'n/a'
          : l.variation === 'nouveau'
            ? LIBELLE_NOUVEAU
            : l.variation
    const row = ws.addRow({
      metrique: l.label,
      a: l.a === null ? '—' : l.a,
      b: l.b === null ? '—' : l.b,
      variation: variationTexte,
    })
    zebrerLigne(row, i)
    // Montants (attendu/collecté) formatés ; autres valeurs simplement alignées à droite.
    ;[2, 3].forEach((c) => (l.montant ? formaterMontantCellule(row.getCell(c)) : alignerDroite(row.getCell(c))))
    alignerDroite(row.getCell(4))
    // Mise en forme conditionnelle : vert si progression (ou apparition), rouge si régression.
    if (l.variation === 'nouveau') {
      row.getCell('variation').font = { bold: true, color: { argb: COULEUR.vert } }
    } else if (typeof l.variation === 'number' && l.variation !== 0) {
      row.getCell('variation').font = {
        bold: true,
        color: { argb: l.variation > 0 ? COULEUR.vert : COULEUR.rouge },
      }
    }
  })

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* PDF (PDFKit) — tableaux premium partagés                                   */
/* -------------------------------------------------------------------------- */

function creerPdf(remplir: (doc: PDFKit.PDFDocument) => void, paysage = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: paysage ? 'landscape' : 'portrait',
      margin: 40,
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    remplir(doc)
    doc.end()
  })
}

/** Rapport d'évolution → document .pdf (Buffer, premium). Fonction pure. */
export function genererEvolutionPdf(
  rapport: RapportFinancier,
  genereLe: Date = new Date(),
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return creerPdf((doc) => {
    const GAUCHE = 40
    const DROITE = 555
    const m = (n: number): string => montantExport(n, langue, devise)
    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: 'Rapport financier — évolution',
      meta: `Années ${rapport.anneeDebut}–${rapport.anneeFin}  ·  Généré le ${formatDateHeure(genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    const colonnes: ColonnePremium[] = [
      { label: 'Année', largeur: 55, align: 'left' },
      { label: 'Attendu', largeur: 95, align: 'right' },
      { label: 'Collecté', largeur: 95, align: 'right' },
      { label: 'Taux (%)', largeur: 60, align: 'right' },
      { label: 'À jour', largeur: 68, align: 'right' },
      { label: 'Partiel', largeur: 66, align: 'right' },
      { label: 'Non à jour', largeur: 76, align: 'right' },
    ]
    const lignes = rapport.annees.map((a) => [
      String(a.annee),
      m(a.totalAttendu),
      m(a.totalCollecte),
      String(a.tauxRecouvrement),
      String(a.membresParStatut.A_JOUR),
      String(a.membresParStatut.PARTIEL),
      String(a.membresParStatut.NON_A_JOUR),
    ])
    const t = totauxEvolution(rapport.annees)
    const total = [
      'TOTAL',
      m(t.totalAttendu),
      m(t.totalCollecte),
      String(t.tauxRecouvrement),
      String(t.aJour),
      String(t.partiel),
      String(t.nonAJour),
    ]
    dessinerCorpsPremium(doc, { colonnes, lignes, total, gauche: GAUCHE, droite: DROITE, yStart })
  })
}

/** Comparaison → document .pdf (Buffer, premium). Fonction pure. */
export function genererComparaisonPdf(
  comp: ComparaisonPeriodes,
  genereLe: Date = new Date(),
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return creerPdf((doc) => {
    const GAUCHE = 40
    const DROITE = 555
    const m = (n: number): string => montantExport(n, langue, devise)
    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: `Comparaison ${comp.anneeA} vs ${comp.anneeB}`,
      meta: `Généré le ${formatDateHeure(genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    const colonnes: ColonnePremium[] = [
      { label: 'Métrique', largeur: 200, align: 'left' },
      { label: String(comp.anneeA), largeur: 105, align: 'right' },
      { label: String(comp.anneeB), largeur: 105, align: 'right' },
      { label: 'Variation (%)', largeur: 105, align: 'right' },
    ]
    // Cellule valeur : montant formaté si la métrique est monétaire, sinon nombre brut ; '—' si null.
    const valeur = (v: number | null, montant: boolean): string =>
      v === null ? '—' : montant ? m(v) : String(v)
    const lignes = lignesComparaison(comp).map((l) => [
      l.label,
      valeur(l.a, l.montant ?? false),
      valeur(l.b, l.montant ?? false),
      l.variation === undefined
        ? ''
        : l.variation === null
          ? 'n/a'
          : l.variation === 'nouveau'
            ? LIBELLE_NOUVEAU
            : pourcentExport(l.variation, langue),
    ])
    dessinerCorpsPremium(doc, { colonnes, lignes, gauche: GAUCHE, droite: DROITE, yStart })
  })
}

/* -------------------------------------------------------------------------- */
/* Comparaison MULTI-années (une colonne par année + Δ vs la précédente)      */
/* -------------------------------------------------------------------------- */

/** Métriques de la table de comparaison ; `cle` présent ⇒ métrique portant une variation. */
interface MetriqueMulti {
  label: string
  valeur: (r: RapportAnnee | null) => number | null
  cle?: keyof VariationsComparaison
  montant?: boolean
}

const METRIQUES_MULTI: MetriqueMulti[] = [
  { label: 'Total attendu', valeur: (r) => r?.totalAttendu ?? null, cle: 'totalAttendu', montant: true },
  { label: 'Total collecté', valeur: (r) => r?.totalCollecte ?? null, cle: 'totalCollecte', montant: true },
  { label: 'Taux de recouvrement (%)', valeur: (r) => r?.tauxRecouvrement ?? null, cle: 'tauxRecouvrement' },
  { label: 'Membres éligibles', valeur: (r) => r?.membresEligibles ?? null },
  { label: 'À jour', valeur: (r) => r?.membresParStatut.A_JOUR ?? null },
  { label: 'Partiel', valeur: (r) => r?.membresParStatut.PARTIEL ?? null },
  { label: 'Non à jour', valeur: (r) => r?.membresParStatut.NON_A_JOUR ?? null },
]

/** Variation (nombre pour l'Excel ; '', 'n/a' ou libellé « Nouveau » sinon). */
function variationMulti(m: MetriqueMulti, ac: ComparaisonMulti['annees'][number]): number | string {
  if (!m.cle) return '' // métrique de décompte : pas de variation
  const v = ac.variations ? ac.variations[m.cle] : null
  if (v === null || v === undefined) return 'n/a'
  if (v === 'nouveau') return LIBELLE_NOUVEAU
  return v
}

/**
 * En-têtes de la table multi pour le PDF : Métrique, puis (année, « Var. % ») par année.
 * NB : on n'utilise PAS le « Δ » (U+0394) de l'Excel — la police Helvetica intégrée de PDFKit ne
 * l'encode pas (rendu illisible). « Var. % » est ASCII et cohérent avec « Variation (%) » du mode paire.
 */
function entetesMulti(comp: ComparaisonMulti): string[] {
  const enTetes = ['Métrique']
  comp.annees.forEach((ac, i) => {
    enTetes.push(String(ac.annee))
    if (i > 0) enTetes.push('Var. %')
  })
  return enTetes
}

/** Indices de colonne (1-based) des cellules Δ, pour la coloration conditionnelle Excel. */
function colonnesVariation(comp: ComparaisonMulti): number[] {
  const cols: number[] = []
  let col = 1 // colonne « Métrique »
  comp.annees.forEach((_, i) => {
    col += 1 // colonne valeur de l'année
    if (i > 0) {
      col += 1 // colonne Δ
      cols.push(col)
    }
  })
  return cols
}

/** Comparaison multi-années → classeur .xlsx (Buffer). Variation colorée. Fonction pure. */
export async function genererComparaisonMultiExcel(
  comp: ComparaisonMulti,
  genereLe: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = genereLe

  const ws = wb.addWorksheet('Comparaison', { views: [{ state: 'frozen', ySplit: 1 }] })
  const colonnes: { header: string; key: string; width: number }[] = [
    { header: 'Métrique', key: 'metrique', width: 26 },
  ]
  comp.annees.forEach((ac, i) => {
    colonnes.push({ header: String(ac.annee), key: `a${i}`, width: 16 })
    if (i > 0) colonnes.push({ header: 'Δ %', key: `d${i}`, width: 11 })
  })
  ws.columns = colonnes
  styliserEnTeteExcel(ws.getRow(1), (col) => col >= 2)

  const deltaCols = colonnesVariation(comp)
  METRIQUES_MULTI.forEach((metrique, i) => {
    // Valeurs de la ligne : label + (valeur année, Δ) par année.
    const valeurs: (string | number)[] = [metrique.label]
    comp.annees.forEach((ac, j) => {
      const v = metrique.valeur(ac.rapport)
      valeurs.push(v === null ? '—' : v)
      if (j > 0) valeurs.push(variationMulti(metrique, ac))
    })
    const row = ws.addRow(valeurs)
    zebrerLigne(row, i)

    // Alignement à droite de toutes les cellules chiffrées (montants formatés le cas échéant).
    for (let c = 2; c <= valeurs.length; c += 1) {
      const cell = row.getCell(c)
      const estDelta = deltaCols.includes(c)
      if (metrique.montant && !estDelta && typeof cell.value === 'number') formaterMontantCellule(cell)
      else alignerDroite(cell)
    }
    // Coloration des Δ : vert progression, rouge régression.
    for (const dc of deltaCols) {
      const val = row.getCell(dc).value
      if (typeof val === 'number' && val !== 0) {
        row.getCell(dc).font = { bold: true, color: { argb: val > 0 ? COULEUR.vert : COULEUR.rouge } }
      }
    }
  })

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

/** Comparaison multi-années → document .pdf (Buffer, paysage pour la largeur, premium). */
export function genererComparaisonMultiPdf(
  comp: ComparaisonMulti,
  genereLe: Date = new Date(),
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return creerPdf((doc) => {
    const GAUCHE = 40
    const DROITE = 800 // A4 paysage (842) - marge
    // Tableau DENSE (beaucoup de colonnes) : on montre les montants SANS suffixe devise (qui
    // déborderait des colonnes étroites → texte tronqué). La devise est rappelée dans le sous-titre.
    const nb = (n: number): string => nombreExport(n, langue)
    const anneesTexte = comp.annees.map((a) => a.annee).join(', ')
    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: `Comparaison multi-années (${devise})`,
      meta: `Années ${anneesTexte}  ·  Généré le ${formatDateHeure(genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    // Colonnes : « Métrique » + colonnes réparties sur la largeur paysage.
    const enTetes = entetesMulti(comp)
    const largeurMetrique = 145
    const largeurCol = (DROITE - GAUCHE - largeurMetrique) / (enTetes.length - 1)
    const colonnes: ColonnePremium[] = enTetes.map((label, i) =>
      i === 0
        ? { label, largeur: largeurMetrique, align: 'left' as const }
        : { label, largeur: largeurCol, align: 'right' as const },
    )

    const lignes = METRIQUES_MULTI.map((metrique) => {
      const cellules: string[] = [metrique.label]
      comp.annees.forEach((ac, j) => {
        const v = metrique.valeur(ac.rapport)
        cellules.push(v === null ? '—' : metrique.montant ? nb(v) : String(v))
        if (j > 0) {
          const va = variationMulti(metrique, ac)
          cellules.push(typeof va === 'number' ? pourcentExport(va, langue) : va)
        }
      })
      return cellules
    })
    dessinerCorpsPremium(doc, { colonnes, lignes, gauche: GAUCHE, droite: DROITE, yStart })
  }, true)
}
