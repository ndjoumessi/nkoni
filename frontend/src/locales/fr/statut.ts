/** Page de statut publique (§2.2) — accessible sans compte, donc traduite comme tout le chrome. */
export default {
  statut: {
    overline: 'Statut du service',
    titre: 'État de NKONI',
    accueil: 'Accueil',
    etats: {
      verification: {
        titre: 'Vérification en cours…',
        texte: 'Nous interrogeons le service.',
      },
      operationnel: {
        titre: 'Tous les systèmes sont opérationnels',
        texte: 'Le service fonctionne normalement.',
      },
      incident: {
        titre: 'Incident en cours',
        texte:
          'Le service semble momentanément indisponible. Nous travaillons à le rétablir — réessayez dans quelques minutes.',
      },
    },
    derniereVerification: 'Dernière vérification : {{heure}}',
    incident: {
      gravites: {
        INFO: 'Information',
        MAINTENANCE: 'Maintenance planifiée',
        INCIDENT: 'Incident',
      },
    },
    support: {
      titre: 'Besoin d’aide ?',
      texte:
        'Une question, un problème, ou vous constatez une anomalie que cette page ne signale pas ?',
      invite: 'Écrivez-nous à',
      sujetMail: 'NKONI — support',
    },
  },
}
