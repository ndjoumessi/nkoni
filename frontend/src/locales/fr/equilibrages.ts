/** Chaînes FR du domaine « equilibrages » (§4 i18n). */
export default {
  equilibrages: {
    message: {
      anneeSansCotisation:
        'La plage sélectionnée contient une année sans cotisation ouverte. Ouvrez cette année ou réduisez la plage.',
      sommeExacte: 'La répartition ajustée doit être exactement égale au total de la période.',
      plageInvalide:
        "La plage d'années est invalide : l'année de début doit précéder celle de fin.",
      generique: 'Une erreur est survenue. Réessayez plus tard.',
    },
    header: {
      overline: 'Trésorerie',
      titre: 'Équilibrer les cotisations',
      back: 'Fiche du membre',
    },
    empty: {
      titre: 'Aucune cotisation à équilibrer',
      description:
        "Ce membre n'a pas encore de contributions. Ouvrez une année (via un versement) avant d'équilibrer.",
    },
    plage: {
      titre: 'Plage à équilibrer',
      description:
        'La valorisation est lissée sur la plage choisie ; les versements réels ne sont jamais modifiés. Seules les années avec cotisation ouverte sont proposées.',
      anneeDebut: 'Année de début',
      anneeFin: 'Année de fin',
      simuler: 'Simuler',
      debutApresFin: "L'année de début doit précéder (ou égaler) l'année de fin.",
      manquantes:
        'Sans cotisation pour {{annees}} : cette/ces année(s) doi(ven)t être ouverte(s), ou réduisez la plage.',
    },
    repartition: {
      titre: 'Répartition proposée',
      simulationNote: 'Simulation — aucune écriture avant « Appliquer »',
      colAnnee: 'Année',
      colAvant: 'Avant',
      colApres: 'Après (ajustable)',
      montantAria: 'Montant après pour {{annee}}',
    },
    recap: {
      totalPeriode: 'Total de la période : ',
      sommeRepartie: 'Somme répartie :',
      equilibre: 'Équilibré',
      ecart: 'Écart',
      ajusterHint:
        "Ajustez les montants pour que la somme répartie soit exactement égale au total de la période — c'est la contrainte pour pouvoir appliquer l'équilibrage.",
    },
    action: {
      reinitialiser: 'Réinitialiser',
      appliquer: "Appliquer l'équilibrage",
    },
    toast: {
      chargementImpossible: 'Chargement impossible',
      simulationImpossible: 'Simulation impossible',
      applique: 'Équilibrage appliqué',
      appliqueDetail: 'Années {{debut}}–{{fin}} · {{total}} redistribués.',
      applicationImpossible: 'Application impossible',
    },
  },
}
