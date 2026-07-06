/** Chaînes EN du domaine « fonctions » (§4 i18n). */
export default {
  fonctions: {
    overline: 'Organisation',
    liste: {
      titre: 'Roles & bodies',
      compteur_one: '{{count}} role',
      compteur_other: '{{count}} roles',
    },
    actions: {
      nouvelle: 'New role',
      annuler: 'Cancel',
      supprimer: 'Delete',
    },
    stats: {
      total: 'Roles',
      occupees: 'Filled',
      vacantes: 'Vacant',
    },
    vide: {
      titre: 'No role',
      descriptionGestion:
        'Create the family bodies (President, Treasurer…) then appoint their holders.',
      description: 'The family roles will appear here.',
      tips: {
        titulaireUnique: 'One holder at a time',
        historique: 'Appointment history',
      },
    },
    badge: {
      vacant: 'Vacant',
    },
    champ: {
      optionnel: 'Optional.',
    },
    creer: {
      titre: 'New role',
      nomLabel: 'Role name',
      nomPlaceholder: 'President, Treasurer, Secretary…',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Role duties and responsibilities…',
      soumettre: 'Create role',
    },
    detail: {
      titre: 'Role',
      retour: 'Back to roles',
      introuvable: 'Role not found.',
      titulaireActuel: 'Current holder',
      enFonctionDepuis: 'in office since {{date}}',
      vacante: 'Vacant role — no current holder.',
    },
    edit: {
      titre: 'Edit role',
      nomLabel: 'Name',
      nomRequis: 'Name is required.',
      descriptionLabel: 'Description',
      enregistrer: 'Save',
    },
    suppression: {
      titre: 'Delete role?',
      avant: 'The role ',
      entre: ' and ',
      emphaseHistorique: 'its entire appointment history',
      apres: ' will be permanently deleted. This action is irreversible.',
      confirmer: 'Delete permanently',
    },
    toast: {
      creee: 'Role created',
      creationImpossible: 'Unable to create',
      majSucces: 'Role updated',
      majImpossible: 'Unable to update',
      supprimee: 'Role deleted',
      suppressionImpossible: 'Unable to delete',
      reessayer: 'Please try again later.',
    },
  },
}
