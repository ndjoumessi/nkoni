/** Chaînes FR du domaine « fonctions » (§4 i18n). */
export default {
  fonctions: {
    overline: 'Organisation',
    liste: {
      titre: 'Fonctions & organes',
      compteur_one: '{{count}} fonction',
      compteur_other: '{{count}} fonctions',
    },
    actions: {
      nouvelle: 'Nouvelle fonction',
      annuler: 'Annuler',
      supprimer: 'Supprimer',
    },
    stats: {
      total: 'Fonctions',
      occupees: 'Occupées',
      vacantes: 'Vacantes',
    },
    vide: {
      titre: 'Aucune fonction',
      descriptionGestion:
        'Créez les organes de la famille (Président, Trésorier…) puis nommez leurs titulaires.',
      description: 'Les fonctions de la famille apparaîtront ici.',
      tips: {
        titulaireUnique: 'Un seul titulaire à la fois',
        historique: 'Historique des nominations',
      },
    },
    badge: {
      vacant: 'Vacant',
    },
    champ: {
      optionnel: 'Optionnel.',
    },
    creer: {
      titre: 'Nouvelle fonction',
      nomLabel: 'Nom de la fonction',
      nomPlaceholder: 'Président, Trésorier, Secrétaire…',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Rôle et attributions de la fonction…',
      soumettre: 'Créer la fonction',
    },
    detail: {
      titre: 'Fonction',
      retour: 'Retour aux fonctions',
      introuvable: 'Fonction introuvable.',
      titulaireActuel: 'Titulaire actuel',
      enFonctionDepuis: 'en fonction depuis le {{date}}',
      vacante: 'Fonction vacante — aucun titulaire en cours.',
    },
    edit: {
      titre: 'Modifier la fonction',
      nomLabel: 'Nom',
      nomRequis: 'Le nom est requis.',
      descriptionLabel: 'Description',
      enregistrer: 'Enregistrer',
    },
    suppression: {
      titre: 'Supprimer la fonction ?',
      avant: 'La fonction ',
      entre: ' et ',
      emphaseHistorique: 'tout son historique de nominations',
      apres: ' seront définitivement supprimés. Cette action est irréversible.',
      confirmer: 'Supprimer définitivement',
    },
    toast: {
      creee: 'Fonction créée',
      creationImpossible: 'Création impossible',
      majSucces: 'Fonction mise à jour',
      majImpossible: 'Mise à jour impossible',
      supprimee: 'Fonction supprimée',
      suppressionImpossible: 'Suppression impossible',
      reessayer: 'Réessayez plus tard.',
    },
  },
}
