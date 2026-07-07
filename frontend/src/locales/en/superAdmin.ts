/** Chaînes EN du domaine « superAdmin » (§4 i18n). */
export default {
  superAdmin: {
    header: {
      plateforme: 'Platform',
      deconnexion: 'Sign out',
      overline: 'Platform',
      titre: 'Organisations',
    },
    resume: {
      organisations_one: '{{count}} organisation',
      organisations_other: '{{count}} organisations',
      actives_one: '{{count}} active',
      actives_other: '{{count}} active',
      suspendues_one: '{{count}} suspended',
      suspendues_other: '{{count}} suspended',
    },
    table: {
      caption: 'Client organisations',
      organisation: 'Organisation',
      membres: 'Members',
      creeeLe: 'Created on',
      statut: 'Status',
      active: 'Active',
      suspendue: 'Suspended',
      actions: 'Actions',
      suspendre: 'Suspend',
      reactiver: 'Reactivate',
    },
    vide: {
      titre: 'No organisation',
      description: 'No client space has been created through self sign-up yet.',
    },
    toast: {
      suspendue: 'Organisation suspended',
      suspensionImpossible: 'Could not suspend',
      reessayer: 'Please try again later.',
      reactivee: 'Organisation reactivated',
      reactivationImpossible: 'Could not reactivate',
    },
    modal: {
      titre: 'Suspend the organisation',
      avertDebut: 'Users of ',
      avertMilieu: ' will no longer be able to sign in. ',
      avertSupprimee: 'No data is deleted',
      avertFin: ' — you can reactivate the space at any time.',
      annuler: 'Cancel',
      suspendreAcces: 'Suspend access',
    },
  },
}
