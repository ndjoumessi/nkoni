/** Chaînes EN du domaine « affectations » (§4 i18n) — éditées dans le détail Fonction. */
export default {
  affectations: {
    compteur_one: '{{count}} appointment',
    compteur_other: '{{count}} appointments',
    enCours: 'Current',
    cloturee: 'Closed',
    enCoursMinuscule: 'current',
    form: {
      titre: 'Appoint a holder',
      hintActif:
        'Appointing a new holder automatically closes the current appointment (on the chosen start date).',
      hintVacant: 'Appoint the first holder of this role.',
      membreLabel: 'Member',
      membreRequis: 'Choose a member.',
      choisirMembre: '— Choose a member —',
      dateLabel: 'Start date',
      dateRequise: 'The start date is required.',
      notesLabel: 'Notes',
      notesHint: 'Optional.',
      notesPlaceholder: 'Circumstances of the appointment…',
      soumettre: 'Appoint',
    },
    historique: {
      titre: 'Appointment history',
      vide: {
        titre: 'No appointment',
        descriptionGestion: 'Appoint a holder above to start the history.',
        description: 'Appointments will appear here.',
      },
    },
    toast: {
      nomme: 'Holder appointed',
      nommeDetail: 'The previous appointment has been closed.',
      nominationImpossible: 'Unable to appoint',
    },
  },
}
