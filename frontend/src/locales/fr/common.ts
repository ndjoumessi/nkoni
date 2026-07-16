/** Chaînes FR transverses (§4 i18n) — réutilisables par plusieurs pages/composants. */
export default {
  commun: {
    langue: { fr: 'Français', en: 'English', selecteur: 'Choisir la langue' },
    forfaits: { GRATUIT: 'Gratuit', PRO: 'Pro', ENTREPRISE: 'Entreprise' },
    surnom: '« {{surnom}} »',
    pagination: {
      label: 'Pagination',
      intervalle: '{{debut}}–{{fin}} sur {{total}}',
      precedent: 'Précédent',
      suivant: 'Suivant',
    },
    actions: {
      seConnecter: 'Se connecter',
      creerMonEspace: 'Créer mon espace',
      retourAccueil: "Retour à l'accueil",
      reessayer: 'Réessayer',
    },
    chargement: 'Chargement',
    erreurGenerique: 'Une erreur est survenue. Réessayez plus tard.',
    erreurs: {
      chargementImpossible: 'Chargement impossible',
    },
    validation: {
      emailInvalide: 'Veuillez saisir une adresse e-mail valide.',
    },
  },
}
