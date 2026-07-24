/** Chaînes EN de la page « Mon profil » (§4 i18n). */
export default {
  profil: {
    header: {
      overline: 'Account',
      titre: 'My profile',
    },
    roles: {
      ADMIN: 'Administrator',
      PRESIDENT: 'President',
      SECRETAIRE: 'Secretary',
      TRESORIERE: 'Treasurer',
      COMMISSAIRE_COMPTES: 'Auditor',
      GUIDE_RELIGIEUX: 'Religious guide',
      MEMBRE_SIMPLE: 'Member',
    },
    identite: {
      titre: 'Identity',
      email: 'Email address',
      role: 'Role',
    },
    photo: {
      titre: 'Profile photo',
      ajouter: 'Add a photo',
      changer: 'Change photo',
      retirer: 'Remove',
      contrainte: 'JPEG or PNG, 5 MB maximum.',
      succes: 'Photo updated',
      succesRetrait: 'Photo removed',
      erreur: 'Operation failed',
      typeInvalide: 'Unsupported format (JPEG or PNG only).',
      tropVolumineux: 'File too large (5 MB maximum).',
    },
    motDePasse: {
      titre: 'Change my password',
      securite: 'Security',
      actuel: 'Current password',
      nouveau: 'New password',
      confirmer: 'Confirm the new password',
      min8: 'At least 8 characters.',
      bouton: 'Update password',
      ancienRequis: 'Enter your current password.',
      different: 'Must be different from the current one.',
      confirmationInvalide: 'The confirmation does not match.',
      correspond: 'Passwords match.',
      ancienIncorrect: 'Current password is incorrect.',
      succes: 'Password changed',
      succesDetail: 'Your new password is active.',
      erreur: 'An error occurred. Please try again.',
    },
    notifications: {
      titre: 'Notification preferences',
      description: 'Choose the notifications you want to receive in the app.',
      erreur: 'Could not update',
      reessayer: 'Please try again later.',
      types: {
        VERSEMENT_RECU: {
          titre: 'Payment recorded',
          desc: 'Confirmation when one of your payments is recorded.',
        },
        COTISATION_RETARD: {
          titre: 'Contribution overdue',
          desc: 'Reminder when your contribution is not up to date.',
        },
      },
    },
    langue: {
      overline: 'Language',
      titre: 'Interface language',
      description:
        'Personal preference, applied to you only — independent of the organisation’s default language.',
      enregistree: 'Language updated',
      enregistreeDetail: 'The interface is now in {{langue}}.',
      erreur: 'Could not change the language. Please try again.',
    },
  },
}
