/** Chaînes FR transverses (§4 i18n) — réutilisables par plusieurs pages/composants. */
export default {
  commun: {
    langue: { fr: 'Français', en: 'English', selecteur: 'Choisir la langue' },
    forfaits: { GRATUIT: 'Gratuit', PRO: 'Pro', ENTREPRISE: 'Entreprise' },
    // Modes de versement — SOURCE UNIQUE des libellés (miroir de `backend/lib/modes-versement.ts`).
    // Autrefois recopiés dans versements/cagnottes/amendes ; consommés via `commun.modesVersement.<mode>`.
    modesVersement: { ESPECES: 'Espèces', TIERS: 'Tiers', MOBILE_MONEY: 'Mobile Money', AUTRE: 'Autre' },
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
    erreurFatale: {
      titre: 'Une erreur inattendue est survenue',
      description:
        "L'application a rencontré un problème et n'a pas pu continuer. Recharger la page devrait résoudre le souci.",
      recharger: 'Recharger la page',
    },
    erreurs: {
      chargementImpossible: 'Chargement impossible',
    },
    validation: {
      emailInvalide: 'Veuillez saisir une adresse e-mail valide.',
    },
  },
}
