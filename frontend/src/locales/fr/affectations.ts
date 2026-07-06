/** Chaînes FR du domaine « affectations » (§4 i18n) — éditées dans le détail Fonction. */
export default {
  affectations: {
    compteur_one: '{{count}} nomination',
    compteur_other: '{{count}} nominations',
    enCours: 'En cours',
    cloturee: 'Clôturée',
    enCoursMinuscule: 'en cours',
    form: {
      titre: 'Nommer un titulaire',
      hintActif:
        'Nommer un nouveau titulaire clôture automatiquement l’affectation en cours (à la date de début choisie).',
      hintVacant: 'Désignez le premier titulaire de cette fonction.',
      membreLabel: 'Membre',
      membreRequis: 'Choisissez un membre.',
      choisirMembre: '— Choisir un membre —',
      dateLabel: 'Date de début',
      dateRequise: 'La date de début est requise.',
      notesLabel: 'Notes',
      notesHint: 'Optionnel.',
      notesPlaceholder: 'Circonstances de la nomination…',
      soumettre: 'Nommer',
    },
    historique: {
      titre: 'Historique des nominations',
      vide: {
        titre: 'Aucune nomination',
        descriptionGestion: 'Nommez un titulaire ci-dessus pour démarrer l’historique.',
        description: 'Les nominations apparaîtront ici.',
      },
    },
    toast: {
      nomme: 'Titulaire nommé',
      nommeDetail: 'L’affectation précédente a été clôturée.',
      nominationImpossible: 'Nomination impossible',
    },
  },
}
