/** Chaînes EN du domaine « equilibrages » (§4 i18n). */
export default {
  equilibrages: {
    message: {
      anneeSansCotisation:
        'The selected range contains a year with no open contribution. Open that year or narrow the range.',
      sommeExacte: 'The adjusted distribution must be exactly equal to the period total.',
      plageInvalide:
        'The year range is invalid: the start year must come before the end year.',
      generique: 'An error occurred. Try again later.',
    },
    header: {
      overline: 'Treasury',
      titre: 'Balance contributions',
      back: 'Member record',
    },
    empty: {
      titre: 'No contribution to balance',
      description:
        'This member has no contributions yet. Open a year (via a payment) before balancing.',
    },
    plage: {
      titre: 'Range to balance',
      description:
        'The valuation is smoothed over the chosen range; the actual payments are never modified. Only years with an open contribution are offered.',
      anneeDebut: 'Start year',
      anneeFin: 'End year',
      simuler: 'Simulate',
      debutApresFin: 'The start year must come before (or equal) the end year.',
      manquantes:
        'No contribution for {{annees}}: this/these year(s) must be opened, or narrow the range.',
    },
    repartition: {
      titre: 'Proposed distribution',
      simulationNote: 'Simulation — nothing is written before « Apply »',
      colAnnee: 'Year',
      colAvant: 'Before',
      colApres: 'After (adjustable)',
      montantAria: 'Amount after for {{annee}}',
    },
    recap: {
      totalPeriode: 'Period total: ',
      sommeRepartie: 'Distributed sum:',
      equilibre: 'Balanced',
      ecart: 'Gap',
      ajusterHint:
        'Adjust the amounts so that the distributed sum is exactly equal to the period total — that is the constraint to be able to apply the balancing.',
    },
    action: {
      reinitialiser: 'Reset',
      appliquer: 'Apply the balancing',
    },
    toast: {
      chargementImpossible: 'Loading failed',
      simulationImpossible: 'Simulation failed',
      applique: 'Balancing applied',
      appliqueDetail: 'Years {{debut}}–{{fin}} · {{total}} redistributed.',
      applicationImpossible: 'Application failed',
    },
  },
}
