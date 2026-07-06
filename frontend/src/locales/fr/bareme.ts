/** Chaînes FR du domaine « bareme » (§4 i18n). */
export default {
  bareme: {
    overline: 'Configuration',
    titre: 'Barème annuel',
    description: 'Montant attendu par membre pour chaque année{{suffixe}}.',
    lectureSeule: ' (lecture seule)',
    ajouterAnnee: 'Ajouter une année',
    anneeLabel: 'Année',
    montantLabel: 'Montant attendu (FCFA)',
    ajouter: 'Ajouter',
    videTitre: 'Aucun barème configuré',
    videDescriptionGestion:
      'Ajoutez une première année ci-dessus pour fixer le montant attendu par membre.',
    videDescription: 'Aucune année n’a encore été configurée par un administrateur.',
    colonneAnnee: 'Année',
    colonneMontant: 'Montant attendu',
    colonneActions: 'Actions',
    montantAria: 'Montant {{annee}}',
    enregistrer: 'Enregistrer',
    annulerAria: 'Annuler',
    modifier: 'Modifier',
    erreurs: {
      montantRequis: 'Le montant est requis.',
      montantInvalide: 'Montant invalide (≥ 0).',
      anneeRequise: "L'année est requise.",
      anneeInvalide: 'Année invalide (entre 1900 et 2200).',
    },
    toast: {
      ajoute: 'Barème ajouté',
      detail: 'Année {{annee}} · {{montant}}.',
      miseAJour: 'Barème mis à jour',
      ajoutImpossible: 'Ajout impossible',
      ajoutEchec: 'Échec de l’ajout du barème.',
      majImpossible: 'Mise à jour impossible',
      majEchec: 'Échec de la mise à jour.',
    },
  },
}
