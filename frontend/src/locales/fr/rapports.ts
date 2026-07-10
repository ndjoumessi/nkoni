/** Chaînes FR du domaine « rapports » (§4 i18n). */
export default {
  rapports: {
    header: {
      overline: 'Trésorerie',
      titre: 'Rapports financiers',
      description: 'Recouvrement par année et comparaison période vs période.',
    },
    variation: {
      na: 'n/a',
      zero: '0 %',
    },
    graphe: {
      titre: 'Attendu vs collecté par année',
      attendu: 'Attendu',
      collecte: 'Collecté',
      resumeAria: 'Graphe du recouvrement par année : attendu et collecté. Détail chiffré dans la table ci-dessous.',
      aucuneDonnee: 'Aucune donnée à afficher.',
    },
    table: {
      annee: 'Année',
      attendu: 'Attendu',
      collecte: 'Collecté',
      taux: 'Taux',
      aJour: 'À jour',
      partiel: 'Partiel',
      nonAJour: 'Non à jour',
    },
    aucunBareme: 'Aucun barème',
    metriques: {
      totalAttendu: 'Total attendu',
      totalCollecte: 'Total collecté',
      tauxRecouvrement: 'Taux de recouvrement',
      membresEligibles: 'Membres éligibles',
      aJour: 'À jour',
      partiel: 'Partiel',
      nonAJour: 'Non à jour',
    },
    mode: {
      aria: 'Mode de rapport',
      evolution: 'Évolution',
      comparaison: 'Comparaison',
      detail: 'Détail par membre',
    },
    detail: {
      annee: 'Année',
      colonnes: {
        membre: 'Membre',
        attendu: 'Montant attendu',
        verse: 'Montant versé',
        valorise: 'Montant valorisé',
        statut: 'Statut',
      },
      total: 'Total',
      totalMembres_one: '{{count}} membre',
      totalMembres_other: '{{count}} membres',
      vide: {
        titre: 'Aucune contribution pour cette année',
        description:
          'Aucun membre n’a de contribution enregistrée pour l’année sélectionnée. Choisissez une autre année.',
      },
    },
    plage: {
      de: 'De',
      a: 'À',
    },
    comparaison: {
      metrique: 'Métrique',
      anneesComparees: 'Années comparées',
      retirer: 'Retirer {{annee}}',
      ajouterAria: 'Ajouter une année à comparer',
      ajouter: '+ Ajouter',
    },
    export: {
      titre: 'Export',
      excel: 'Excel',
      pdf: 'PDF',
      pret: 'Export prêt',
      pretDetail: 'Le fichier {{format}} a été téléchargé.',
      echec: 'Échec de l’export',
      reessayer: 'Réessayez plus tard.',
    },
    synthese: {
      totalCollecte: 'Total collecté',
      totalAttendu: 'Total attendu',
      tauxGlobal: 'Taux global',
      annees_one: '{{count}} année',
      annees_other: '{{count}} années',
    },
    vide: {
      titre: 'Aucune donnée à analyser',
      description:
        'Aucun barème annuel n’est encore configuré. Les rapports s’appuient sur les années disposant d’un barème.',
    },
    videPlage: {
      titre: 'Aucune année configurée sur cette plage',
      description:
        'Les années sans barème sont ignorées. Élargissez la plage ou configurez les barèmes manquants.',
    },
    videComparaison: {
      titre: 'Choisissez au moins deux années',
      description:
        'Ajoutez des années à comparer ci-dessus. La variation est calculée d’une année à la suivante dans la sélection.',
    },
  },
}
