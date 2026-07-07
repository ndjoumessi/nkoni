/** Chaînes EN du domaine « bareme » (§4 i18n). */
export default {
  bareme: {
    overline: 'Configuration',
    titre: 'Annual schedule',
    description: 'Amount expected per member for each year{{suffixe}}.',
    lectureSeule: ' (read only)',
    ajouterAnnee: 'Add a year',
    anneeLabel: 'Year',
    montantLabel: 'Expected amount (FCFA)',
    ajouter: 'Add',
    videTitre: 'No schedule configured',
    videDescriptionGestion:
      'Add a first year above to set the amount expected per member.',
    videDescription: 'No year has been configured by an administrator yet.',
    colonneAnnee: 'Year',
    colonneMontant: 'Expected amount',
    colonneActions: 'Actions',
    montantAria: 'Amount {{annee}}',
    enregistrer: 'Save',
    annulerAria: 'Cancel',
    modifier: 'Edit',
    erreurs: {
      montantRequis: 'The amount is required.',
      montantInvalide: 'Invalid amount (≥ 0).',
      anneeRequise: 'The year is required.',
      anneeInvalide: 'Invalid year (between 1900 and 2200).',
    },
    toast: {
      ajoute: 'Schedule added',
      detail: 'Year {{annee}} · {{montant}}.',
      miseAJour: 'Schedule updated',
      ajoutImpossible: 'Could not add',
      ajoutEchec: 'Failed to add the schedule.',
      majImpossible: 'Could not update',
      majEchec: 'Update failed.',
    },
  },
}
