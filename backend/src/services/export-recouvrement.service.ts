/**
 * Service Export « RECOUVREMENT » — NKONI (§5, matrice « Export »).
 *
 * Produit la liste des membres ACTIFS qui ont un RESTE DÛ (non à jour ou partiel), avec ce qu'il
 * leur manque pour être à jour et les infos de relance (téléphone, branche). C'est la liste de
 * travail du bureau/trésorier pour les rappels.
 *
 * Même architecture que `export.service.ts` : ASSEMBLAGE (Prisma isolé → structure neutre) séparé
 * du FORMATAGE (fonctions pures `→ Buffer`). Réutilise INTÉGRALEMENT le moteur `export-style.ts`
 * (mêmes en-têtes premium, zébrure, ligne TOTAL, neutralisation de formule Excel). Lecture seule.
 *
 * Reste dû = `totalAttenduCumule − totalValoriseCumule`, cumulé sur toute la fenêtre d'adhésion
 * (« ce qui manque pour être VRAIMENT à jour »), borné à 0 (un membre qui a trop réglé une année
 * est À JOUR, jamais un reste négatif). En-têtes en français comme les autres exports ; seuls les
 * montants et la date sont localisés (langue + devise de l'exporteur).
 */

import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { formatDateHeure, type Langue, type Devise } from '../lib/i18n'
import {
  calculerStatutsMembres,
  type MembreStatutPrisma,
  type StatutMembreValue,
} from './membreStatut.service'
import type { StatutContributionValue } from './statutContribution'
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

export interface LigneRecouvrement {
  membreId: string
  nom: string
  prenom: string
  telephone: string | null
  branche: string | null
  anneeAdhesion: number
  statut: StatutContributionValue
  attendu: number
  valorise: number
  resteDu: number
}

export interface DonneesRecouvrement {
  genereLe: Date
  anneeCourante: number
  lignes: LigneRecouvrement[]
  totalAttendu: number
  totalValorise: number
  totalResteDu: number
}

/* -------------------------------------------------------------------------- */
/* Assemblage                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Construit la liste de recouvrement : membres ACTIFS dont le reste dû cumulé est strictement
 * positif, triés par RESTE DÛ décroissant (les plus gros débiteurs en tête ; nom en départage).
 * `anneeCourante` = borne haute de la fenêtre cumulée (fuseau applicatif, résolu par la route). Pas
 * de plafond de troncature : un export doit être complet.
 *
 * @param now Injecté pour les tests (horodatage `genereLe`).
 */
export async function assemblerDonneesRecouvrement(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  now: Date = new Date(),
): Promise<DonneesRecouvrement> {
  const actif: StatutMembreValue = 'ACTIF'
  const { items } = await calculerStatutsMembres(prisma, anneeCourante, { statut: actif })

  const lignes: LigneRecouvrement[] = items
    .map((m) => ({
      membreId: m.id,
      nom: m.nom,
      prenom: m.prenom,
      telephone: m.telephone,
      branche: m.branche?.nom ?? null,
      anneeAdhesion: m.anneeAdhesion,
      statut: m.statutCotisation,
      attendu: m.totalAttenduCumule,
      valorise: m.totalValoriseCumule,
      // Borné à 0 : un trop-versé ponctuel ne doit pas afficher un reste négatif.
      resteDu: Math.max(0, m.totalAttenduCumule - m.totalValoriseCumule),
    }))
    .filter((l) => l.resteDu > 0)
    // Reste dû DÉCROISSANT : les plus gros débiteurs en tête (liste de relance), nom en départage.
    .sort(
      (a, b) =>
        b.resteDu - a.resteDu || a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom),
    )

  const totaux = lignes.reduce(
    (acc, l) => ({
      attendu: acc.attendu + l.attendu,
      valorise: acc.valorise + l.valorise,
      resteDu: acc.resteDu + l.resteDu,
    }),
    { attendu: 0, valorise: 0, resteDu: 0 },
  )

  return {
    genereLe: now,
    anneeCourante,
    lignes,
    totalAttendu: totaux.attendu,
    totalValorise: totaux.valorise,
    totalResteDu: totaux.resteDu,
  }
}

/* -------------------------------------------------------------------------- */
/* Libellés partagés                                                          */
/* -------------------------------------------------------------------------- */

/** Libellé FR du statut de cotisation (comme les autres exports, en-têtes/labels non traduits). */
const LIBELLE_STATUT: Record<StatutContributionValue, string> = {
  A_JOUR: 'À jour',
  PARTIEL: 'Partiel',
  NON_A_JOUR: 'Non à jour',
}

const tel = (t: string | null): string => t ?? '—'
const branche = (b: string | null): string => b ?? '—'

/* -------------------------------------------------------------------------- */
/* Formatage Excel (exceljs) — colonnes détaillées                            */
/* -------------------------------------------------------------------------- */

const COLS_MONTANT = new Set<string>(['attendu', 'valorise', 'resteDu'])

/**
 * Colonnes Excel. `Téléphone` et `Branche` sont OMISES si AUCUNE ligne n'en porte (org sans
 * téléphones/branches saisis) : une colonne entièrement vide n'est que du bruit. Elles réapparaissent
 * dès qu'une seule ligne a la donnée — pas de suppression en dur qui pénaliserait les orgs qui s'en
 * servent.
 */
function colonnesXlsx(
  donnees: DonneesRecouvrement,
): { header: string; key: string; width: number }[] {
  const aTel = donnees.lignes.some((l) => l.telephone)
  const aBranche = donnees.lignes.some((l) => l.branche)
  return [
    { header: 'Nom', key: 'nom', width: 20 },
    { header: 'Prénom', key: 'prenom', width: 20 },
    ...(aTel ? [{ header: 'Téléphone', key: 'telephone', width: 16 }] : []),
    ...(aBranche ? [{ header: 'Branche', key: 'branche', width: 18 }] : []),
    { header: 'Adhésion', key: 'anneeAdhesion', width: 10 },
    { header: 'Statut', key: 'statut', width: 12 },
    { header: 'Attendu', key: 'attendu', width: 16 },
    { header: 'Valorisé', key: 'valorise', width: 16 },
    { header: 'Reste dû', key: 'resteDu', width: 16 },
  ]
}

export async function genererRecouvrementExcel(donnees: DonneesRecouvrement): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'NKONI'
  wb.created = donnees.genereLe

  const colonnes = colonnesXlsx(donnees)
  const ws = wb.addWorksheet('Recouvrement', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = colonnes.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  const colEstMontant = (col: number): boolean => COLS_MONTANT.has(colonnes[col - 1]?.key ?? '')
  styliserEnTeteExcel(ws.getRow(1), colEstMontant)

  const formaterMontants = (row: ExcelJS.Row): void => {
    colonnes.forEach((c, idx) => {
      if (COLS_MONTANT.has(c.key)) formaterMontantCellule(row.getCell(idx + 1))
    })
  }

  donnees.lignes.forEach((l, i) => {
    const row = ws.addRow({
      // Données saisies par l'utilisateur → neutraliser toute injection de formule (audit Sécu E2).
      nom: neutraliserFormuleCellule(l.nom),
      prenom: neutraliserFormuleCellule(l.prenom),
      telephone: neutraliserFormuleCellule(tel(l.telephone)),
      branche: neutraliserFormuleCellule(branche(l.branche)),
      anneeAdhesion: l.anneeAdhesion,
      statut: LIBELLE_STATUT[l.statut],
      attendu: l.attendu,
      valorise: l.valorise,
      resteDu: l.resteDu,
    })
    zebrerLigne(row, i)
    formaterMontants(row)
  })

  const ligneTotal = ws.addRow({
    nom: 'TOTAL',
    attendu: donnees.totalAttendu,
    valorise: donnees.totalValorise,
    resteDu: donnees.totalResteDu,
  })
  styliserTotalExcel(ligneTotal)
  formaterMontants(ligneTotal)

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/* -------------------------------------------------------------------------- */
/* Formatage PDF (PDFKit) — A4 paysage, colonnes Téléphone/Branche adaptatives */
/* -------------------------------------------------------------------------- */

export function genererRecouvrementPdf(
  donnees: DonneesRecouvrement,
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // PAYSAGE : 7 colonnes dont un nom composé (souvent long au Cameroun) — l'A4 portrait forçait
    // le nom sur 2 lignes. En paysage la colonne « Membre » tient 200 pt → noms entiers sur 1 ligne.
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const GAUCHE = 40
    const DROITE = 802 // A4 paysage = 841,89 pt de large, moins la marge de 40
    const m = (n: number): string => montantExport(n, langue, devise)

    const sousTitre =
      donnees.lignes.length > 0
        ? `Membres à relancer : ${donnees.lignes.length}`
        : 'Aucun membre à relancer — tous à jour'

    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: 'Rapport de recouvrement',
      meta: `Reste dû cumulé jusqu'à ${donnees.anneeCourante}  ·  ${sousTitre}  ·  Généré le ${formatDateHeure(donnees.genereLe, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    // Téléphone/Branche OMISES si toute la liste est vide (colonne inutile) ; leur largeur revient
    // à « Membre ». Total = 762 pt (A4 paysage) dans tous les cas.
    const aTel = donnees.lignes.some((l) => l.telephone)
    const aBranche = donnees.lignes.some((l) => l.branche)
    const largeurMembre = 200 + (aTel ? 0 : 100) + (aBranche ? 0 : 120)
    const colonnes: ColonnePremium[] = [
      { label: 'Membre', largeur: largeurMembre, align: 'left' },
      ...(aTel ? [{ label: 'Téléphone', largeur: 100, align: 'left' as const }] : []),
      ...(aBranche ? [{ label: 'Branche', largeur: 120, align: 'left' as const }] : []),
      { label: 'Statut', largeur: 80, align: 'left' },
      { label: 'Attendu', largeur: 84, align: 'right' },
      { label: 'Valorisé', largeur: 84, align: 'right' },
      { label: 'Reste dû', largeur: 94, align: 'right' },
    ]
    const lignes = donnees.lignes.map((l) => [
      `${l.nom} ${l.prenom}`.trim(),
      ...(aTel ? [tel(l.telephone)] : []),
      ...(aBranche ? [branche(l.branche)] : []),
      LIBELLE_STATUT[l.statut],
      m(l.attendu),
      m(l.valorise),
      m(l.resteDu),
    ])
    const total = [
      'TOTAL',
      ...(aTel ? [''] : []),
      ...(aBranche ? [''] : []),
      '',
      m(donnees.totalAttendu),
      m(donnees.totalValorise),
      m(donnees.totalResteDu),
    ]

    dessinerCorpsPremium(doc, { colonnes, lignes, total, gauche: GAUCHE, droite: DROITE, yStart })
    doc.end()
  })
}
