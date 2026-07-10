/** Chaînes EN du domaine « dashboard » (§4 i18n). */
export default {
  dashboard: {
    header: {
      overline: 'Dashboard',
      titre: 'Overview',
    },
    chargement: 'Loading…',
    erreur: 'Failed to load the dashboard.',
    vue: {
      COMPLET: 'Full view',
      FINANCIER: 'Financial view',
      RESTREINT: 'Restricted view',
      PERSO: 'My situation',
    },
    statut: {
      A_JOUR: 'Up to date',
      PARTIEL: 'Partial',
      NON_A_JOUR: 'Not up to date',
    },
    alerteBareme: {
      avant: 'The scale for year',
      apres:
        'is not configured yet. The statuses shown ignore this year until an expected amount is defined.',
    },
    onboarding: {
      titre: 'Welcome to NKONI',
      descriptionGestion:
        'No contribution is being tracked yet. Start by configuring the annual scale: it sets the amount expected per member and unlocks the opening of years.',
      descriptionLecture:
        'No contribution is being tracked yet. The annual scale has not been configured by an administrator yet.',
      action: 'Configure the first scale',
      tips: {
        bareme: 'Define the annual scale',
        membres: 'Add members',
        versements: 'Record payments',
      },
    },
    stat: {
      membresAJour: 'Members up to date',
      membresActifs: 'Active members',
      branches: 'Branches',
    },
    perso: {
      overline: 'My situation · {{annee}}',
      statutTitre: 'Contribution status',
      totalAttendu: 'Total expected (cumulative)',
      totalValorise: 'Total paid / valued (cumulative)',
    },
    hero: {
      indicateur: 'Key indicator',
      recouvre: 'collected',
      totalCollecte: 'Total collected',
      totalAttendu: 'Total expected',
    },
    repartition: {
      aucuneDonnee: 'No data yet.',
      total: 'Total',
      cotisationTitre: 'Members by contribution status',
      membreTitre: 'Members by status',
      membre: {
        ACTIF: 'Active',
        INACTIF: 'Inactive',
        DECEDE: 'Deceased',
      },
    },
    evolution: {
      titre: 'Cumulative recovery · {{annee}}',
      collecte: 'Collected (cumulative)',
      attendu: 'Target (cumulative)',
      colonneMois: 'Month',
      resumeAria:
        'Cumulative collection progress for {{annee}}: amount collected cumulatively month over month against the cumulative target. Full figures in the companion table.',
      aucuneDonnee: 'No payment recorded this year yet.',
    },
    analyse: {
      recouvrementBranche: 'Collection by branch',
      aRelancer: 'To follow up',
      tousAJour: 'All active members are up to date. 🎉',
      reste: 'Remaining {{montant}}',
      voirTous: 'See all members to follow up',
    },
    export: {
      titre: 'Export contributions',
      excel: 'Excel',
      pdf: 'PDF',
      pretTitre: 'Export ready',
      pretDetail: 'The {{format}} file has been downloaded.',
      echec: 'Export failed',
      reessayez: 'Try again later.',
    },
  },
}
