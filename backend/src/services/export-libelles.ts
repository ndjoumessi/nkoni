/**
 * Libellés des documents exportés (contributions §5.9, rapports Évolution / Comparaison / Multi),
 * en FR et EN — source UNIQUE partagée par `export.service.ts` et `export-rapport.service.ts`.
 *
 * Pourquoi ce fichier existe : les deux services écrivaient leurs titres, en-têtes de colonnes et
 * ligne TOTAL **en dur, en français**, alors qu'ils recevaient déjà la langue pour formater montants
 * et dates. Un exportateur anglophone obtenait donc un document au titre français avec des nombres
 * à l'anglaise — incohérent DANS un même fichier. Le reçu de versement et le compte-rendu de réunion
 * étaient, eux, déjà bilingues : la mécanique existait, elle n'avait pas été appliquée ici.
 *
 * **La parité FR/EN est tenue par le TYPAGE, pas par un test** : `EN` est déclaré `typeof FR`, donc
 * ajouter une clé au français sans son équivalent anglais casse le build (même principe que le
 * catalogue i18n du front, dont `en/index` est typé contre `fr/index`).
 *
 * **Gotcha PDFKit** : Helvetica est en WinAnsi — rester en Latin-1, aucun caractère hors de cette
 * plage dans ces libellés (cf. `docs/architecture-i18n.md`, mêmes contraintes que `montantExport`).
 */

import type { Langue } from '../lib/i18n'

const FR = {
  // Communs
  genereLe: 'Généré le',
  total: 'TOTAL',
  annee: 'Année',
  annees: 'Années',

  // Export des contributions
  contributionsSousTitre: 'Export des contributions',
  contributionsFeuille: 'Contributions',
  toutesAnnees: 'Toutes années',
  membre: 'Membre',
  nom: 'Nom',
  prenom: 'Prénom',
  montantAttendu: 'Montant attendu',
  montantVerse: 'Montant versé',
  montantValorise: 'Montant valorisé',

  // Rapport d'évolution
  evolutionSousTitre: 'Rapport financier — évolution',
  evolutionFeuille: 'Évolution',
  attendu: 'Attendu',
  collecte: 'Collecté',
  taux: 'Taux (%)',
  aJour: 'À jour',
  partiel: 'Partiel',
  nonAJour: 'Non à jour',

  // Comparaison (deux années et multi-années)
  comparaisonFeuille: 'Comparaison',
  comparaisonSousTitre: 'Comparaison',
  comparaisonMultiSousTitre: 'Comparaison multi-années',
  metrique: 'Métrique',
  variation: 'Variation (%)',
  totalAttendu: 'Total attendu',
  totalCollecte: 'Total collecté',
  tauxRecouvrement: 'Taux de recouvrement (%)',
  membresEligibles: 'Membres éligibles',
  /** Variation « apparition » (base 0 → positif) : ni un pourcentage, ni « n/a ». */
  nouveau: 'Nouveau',
}

// Typé CONTRE le français : une clé ajoutée là-bas et oubliée ici ne compile pas.
const EN: typeof FR = {
  genereLe: 'Generated on',
  total: 'TOTAL',
  annee: 'Year',
  annees: 'Years',

  contributionsSousTitre: 'Contributions export',
  contributionsFeuille: 'Contributions',
  toutesAnnees: 'All years',
  membre: 'Member',
  nom: 'Last name',
  prenom: 'First name',
  montantAttendu: 'Expected amount',
  montantVerse: 'Paid amount',
  montantValorise: 'Credited amount',

  evolutionSousTitre: 'Financial report — trend',
  evolutionFeuille: 'Trend',
  attendu: 'Expected',
  collecte: 'Collected',
  taux: 'Rate (%)',
  aJour: 'Up to date',
  partiel: 'Partial',
  nonAJour: 'Not up to date',

  comparaisonFeuille: 'Comparison',
  comparaisonSousTitre: 'Comparison',
  comparaisonMultiSousTitre: 'Multi-year comparison',
  metrique: 'Metric',
  variation: 'Change (%)',
  totalAttendu: 'Total expected',
  totalCollecte: 'Total collected',
  tauxRecouvrement: 'Collection rate (%)',
  membresEligibles: 'Eligible members',
  nouveau: 'New',
}

export type LibellesExport = typeof FR

/** Libellés du document dans la langue de l'exportateur (repli FR, comme le reste du serveur). */
export function libellesExport(langue: Langue): LibellesExport {
  return langue === 'EN' ? EN : FR
}
