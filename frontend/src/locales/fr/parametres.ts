/** Chaînes FR de l'écran Paramètres de l'organisation (§5 i18n). Lecture seule (params immuables). */
export default {
  parametres: {
    overline: 'Organisation',
    titre: 'Paramètres',
    sousTitre: 'Les informations de votre espace, telles que définies à la création.',
    erreur: 'Impossible de charger les paramètres de l’organisation.',
    infos: {
      titre: 'Informations de l’organisation',
      nom: 'Nom de l’organisation',
      devise: 'Devise',
      langue: 'Langue par défaut',
      creation: 'Espace créé le',
      chef: 'Chef de l’organisation',
      chefNonDesigne: 'Non désigné',
    },
    immuable: {
      titre: 'Paramètres définitifs',
      texte:
        'Le nom, la devise et la langue par défaut sont fixés à la création de l’espace et ne peuvent plus être modifiés. Chaque membre peut néanmoins choisir sa propre langue d’affichage dans « Mon profil ».',
    },
    membres: {
      titre: 'Membres',
      compteur_one: '{{count}} membre sur {{limite}}',
      compteur_other: '{{count}} membres sur {{limite}}',
      compteurIllimite_one: '{{count}} membre',
      compteurIllimite_other: '{{count}} membres',
      forfait: 'Forfait gratuit',
      illimite: 'Membres illimités',
      restants_one: '{{count}} place restante',
      restants_other: '{{count}} places restantes',
      limiteAtteinte: 'Limite du forfait atteinte',
    },
  },
}
