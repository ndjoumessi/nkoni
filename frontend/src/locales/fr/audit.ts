/** Chaînes FR du domaine « audit » (§4 i18n). */
export default {
  audit: {
    header: {
      overline: 'Gouvernance',
      titre: 'Journal d’audit',
      entrees_one: '{{count}} entrée',
      entrees_other: '{{count}} entrées',
    },
    entites: {
      Membre: 'Membre',
      Contribution: 'Contribution',
      Versement: 'Versement',
      EquilibrageContribution: 'Équilibrage',
      Utilisateur: 'Utilisateur',
      Conflit: 'Conflit',
    },
    actions: {
      CREATE: 'Création',
      UPDATE: 'Modification',
      DELETE: 'Suppression',
    },
    diff: {
      aucuneDonnee: 'Aucune donnée capturée.',
      champ: 'Champ',
      avantApres: 'Avant → Après',
    },
    filtres: {
      typeEntite: 'Type d’entité',
      toutes: 'Toutes',
      acteur: 'Acteur',
      tous: 'Tous',
      du: 'Du',
      au: 'Au',
      reinitialiser: 'Réinitialiser',
    },
    vide: {
      titre: 'Aucune entrée',
      avecFiltres: 'Aucune écriture ne correspond à ces filtres.',
      sansFiltres: 'Les écritures tracées apparaîtront ici.',
    },
    table: {
      caption: "Journal d'audit (déplier une ligne pour le détail avant/après)",
      date: 'Date',
      action: 'Action',
      entite: 'Entité',
      acteur: 'Acteur',
      systeme: 'système',
    },
    pagination: {
      page: 'Page {{page}} / {{total}}',
      precedent: 'Précédent',
      suivant: 'Suivant',
    },
  },
}
