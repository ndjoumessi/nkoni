/** Chaînes FR de la page « Mon profil » (§4 i18n). Le sélecteur de langue (Lot 0) est ici ;
 * le reste de la page est externalisé au lot F5. */
export default {
  profil: {
    header: {
      overline: 'Compte',
      titre: 'Mon profil',
    },
    roles: {
      ADMIN: 'Administrateur',
      PRESIDENT: 'Président',
      SECRETAIRE: 'Secrétaire',
      TRESORIERE: 'Trésorière',
      COMMISSAIRE_COMPTES: 'Commissaire aux comptes',
      GUIDE_RELIGIEUX: 'Guide religieux',
      MEMBRE_SIMPLE: 'Membre',
    },
    identite: {
      titre: 'Identité',
      email: 'Adresse e-mail',
      role: 'Rôle',
    },
    photo: {
      titre: 'Photo de profil',
      ajouter: 'Ajouter une photo',
      changer: 'Changer la photo',
      retirer: 'Retirer',
      contrainte: 'JPEG ou PNG, 5 Mo maximum.',
      succes: 'Photo mise à jour',
      succesRetrait: 'Photo retirée',
      erreur: 'Opération impossible',
      typeInvalide: 'Format non pris en charge (JPEG ou PNG uniquement).',
      tropVolumineux: 'Fichier trop volumineux (5 Mo maximum).',
    },
    motDePasse: {
      titre: 'Changer mon mot de passe',
      securite: 'Sécurité',
      actuel: 'Mot de passe actuel',
      nouveau: 'Nouveau mot de passe',
      confirmer: 'Confirmer le nouveau mot de passe',
      min8: 'Au moins 8 caractères.',
      bouton: 'Mettre à jour le mot de passe',
      ancienRequis: 'Saisissez votre mot de passe actuel.',
      different: 'Doit être différent de l’actuel.',
      confirmationInvalide: 'La confirmation ne correspond pas.',
      ancienIncorrect: 'Mot de passe actuel incorrect.',
      succes: 'Mot de passe modifié',
      succesDetail: 'Votre nouveau mot de passe est actif.',
      erreur: 'Une erreur est survenue. Réessayez.',
    },
    notifications: {
      titre: 'Préférences de notification',
      description: 'Choisissez les notifications que vous souhaitez recevoir dans l’application.',
      erreur: 'Modification impossible',
      reessayer: 'Réessayez plus tard.',
      types: {
        VERSEMENT_RECU: {
          titre: 'Versement enregistré',
          desc: 'Confirmation quand un de vos versements est enregistré.',
        },
        COTISATION_RETARD: {
          titre: 'Cotisation en retard',
          desc: 'Rappel quand votre cotisation n’est pas à jour.',
        },
      },
    },
    langue: {
      overline: 'Langue',
      titre: 'Langue de l’interface',
      description:
        'Préférence personnelle, appliquée à vous seul — indépendante de la langue par défaut de l’organisation.',
      enregistree: 'Langue mise à jour',
      enregistreeDetail: 'L’interface est maintenant en {{langue}}.',
      erreur: 'Impossible de changer la langue. Réessayez.',
    },
  },
}
