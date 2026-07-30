/** Chaînes EN transverses (§4 i18n). */
export default {
  commun: {
    langue: { fr: 'Français', en: 'English', selecteur: 'Choose language' },
    forfaits: { GRATUIT: 'Free', PRO: 'Pro', ENTREPRISE: 'Enterprise' },
    // Payment modes — SINGLE SOURCE of labels (mirrors `backend/lib/modes-versement.ts`).
    modesVersement: { ESPECES: 'Cash', TIERS: 'Third party', MOBILE_MONEY: 'Mobile Money', AUTRE: 'Other' },
    surnom: '“{{surnom}}”',
    pagination: {
      label: 'Pagination',
      intervalle: '{{debut}}–{{fin}} of {{total}}',
      precedent: 'Previous',
      suivant: 'Next',
    },
    actions: {
      seConnecter: 'Sign in',
      creerMonEspace: 'Create my space',
      retourAccueil: 'Back to home',
      reessayer: 'Retry',
    },
    chargement: 'Loading',
    erreurGenerique: 'Something went wrong. Please try again later.',
    erreurFatale: {
      titre: 'An unexpected error occurred',
      description:
        'The application ran into a problem and could not continue. Reloading the page should fix it.',
      recharger: 'Reload the page',
    },
    erreurs: {
      chargementImpossible: 'Loading failed',
    },
    validation: {
      emailInvalide: 'Please enter a valid email address.',
    },
  },
}
