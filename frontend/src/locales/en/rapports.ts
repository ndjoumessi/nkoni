/** Chaînes EN du domaine « rapports » (§4 i18n). */
export default {
  rapports: {
    header: {
      overline: 'Treasury',
      titre: 'Financial reports',
      description: 'Collection by year and period-over-period comparison.',
    },
    variation: {
      na: 'n/a',
      zero: '0 %',
    },
    graphe: {
      titre: 'Expected vs collected by year',
      attendu: 'Expected',
      collecte: 'Collected',
    },
    table: {
      annee: 'Year',
      attendu: 'Expected',
      collecte: 'Collected',
      taux: 'Rate',
      aJour: 'Up to date',
      partiel: 'Partial',
      nonAJour: 'Behind',
    },
    aucunBareme: 'No schedule',
    metriques: {
      totalAttendu: 'Total expected',
      totalCollecte: 'Total collected',
      tauxRecouvrement: 'Collection rate',
      membresEligibles: 'Eligible members',
      aJour: 'Up to date',
      partiel: 'Partial',
      nonAJour: 'Behind',
    },
    mode: {
      aria: 'Report mode',
      evolution: 'Trend',
      comparaison: 'Comparison',
      detail: 'By member',
    },
    detail: {
      annee: 'Year',
      colonnes: {
        membre: 'Member',
        attendu: 'Expected amount',
        verse: 'Amount paid',
        valorise: 'Valued amount',
        statut: 'Status',
      },
      total: 'Total',
      totalMembres_one: '{{count}} member',
      totalMembres_other: '{{count}} members',
      vide: {
        titre: 'No contribution for this year',
        description:
          'No member has a recorded contribution for the selected year. Pick another year.',
      },
    },
    plage: {
      de: 'From',
      a: 'To',
    },
    comparaison: {
      metrique: 'Metric',
      anneesComparees: 'Compared years',
      retirer: 'Remove {{annee}}',
      ajouterAria: 'Add a year to compare',
      ajouter: '+ Add',
    },
    export: {
      titre: 'Export',
      excel: 'Excel',
      pdf: 'PDF',
      pret: 'Export ready',
      pretDetail: 'The {{format}} file has been downloaded.',
      echec: 'Export failed',
      reessayer: 'Please try again later.',
    },
    synthese: {
      totalCollecte: 'Total collected',
      totalAttendu: 'Total expected',
      tauxGlobal: 'Overall rate',
      annees_one: '{{count}} year',
      annees_other: '{{count}} years',
    },
    vide: {
      titre: 'No data to analyse',
      description:
        'No annual schedule has been configured yet. Reports rely on the years that have a schedule.',
    },
    videPlage: {
      titre: 'No year configured in this range',
      description:
        'Years without a schedule are ignored. Widen the range or configure the missing schedules.',
    },
    videComparaison: {
      titre: 'Choose at least two years',
      description:
        'Add years to compare above. The variation is computed from one year to the next in the selection.',
    },
  },
}
