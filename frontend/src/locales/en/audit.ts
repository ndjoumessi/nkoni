/** Chaînes EN du domaine « audit » (§4 i18n). */
export default {
  audit: {
    header: {
      overline: 'Governance',
      titre: 'Audit log',
      entrees_one: '{{count}} entry',
      entrees_other: '{{count}} entries',
    },
    entites: {
      Membre: 'Member',
      Contribution: 'Contribution',
      Versement: 'Payment',
      EquilibrageContribution: 'Rebalancing',
      Utilisateur: 'User',
      Conflit: 'Dispute',
    },
    actions: {
      CREATE: 'Creation',
      UPDATE: 'Update',
      DELETE: 'Deletion',
    },
    diff: {
      aucuneDonnee: 'No data captured.',
      champ: 'Field',
      avantApres: 'Before → After',
    },
    filtres: {
      typeEntite: 'Entity type',
      toutes: 'All',
      acteur: 'Actor',
      tous: 'All',
      du: 'From',
      au: 'To',
      reinitialiser: 'Reset',
    },
    vide: {
      titre: 'No entry',
      avecFiltres: 'No record matches these filters.',
      sansFiltres: 'Tracked records will appear here.',
    },
    table: {
      caption: 'Audit log (expand a row for the before/after detail)',
      date: 'Date',
      action: 'Action',
      entite: 'Entity',
      acteur: 'Actor',
      systeme: 'system',
    },
    pagination: {
      page: 'Page {{page}} / {{total}}',
      precedent: 'Previous',
      suivant: 'Next',
    },
  },
}
