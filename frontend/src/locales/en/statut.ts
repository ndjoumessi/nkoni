/** EN mirror of the public status page namespace (§2.2). */
export default {
  statut: {
    overline: 'Service status',
    titre: 'NKONI status',
    accueil: 'Home',
    etats: {
      verification: {
        titre: 'Checking…',
        texte: 'We are querying the service.',
      },
      operationnel: {
        titre: 'All systems operational',
        texte: 'The service is running normally.',
      },
      incident: {
        titre: 'Ongoing incident',
        texte:
          'The service appears to be temporarily unavailable. We are working to restore it — please try again in a few minutes.',
      },
    },
    derniereVerification: 'Last checked: {{heure}}',
    support: {
      titre: 'Need help?',
      texte: 'A question, a problem, or something wrong that this page does not report?',
      invite: 'Write to us at',
      sujetMail: 'NKONI — support',
    },
  },
}
