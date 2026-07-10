/** Chaînes EN de la page d'auto-inscription (§4 i18n) — « Créer mon espace ». */
export default {
  inscription: {
    sousTitre: 'Create the secure space for your community',
    accroche: 'A few details to get started. You’ll be its administrator.',
    nomLabel: 'Organization name',
    nomPlaceholder: 'Family, association or tontine…',
    deviseLabel: 'Currency',
    langueLabel: 'Language',
    devises: {
      fcfa: 'FCFA (CFA Franc)',
      eur: 'EUR (Euro)',
      usd: 'USD (US Dollar)',
      cad: 'CAD (Canadian Dollar)',
    },
    immuable: 'Currency and language are permanent after creation.',
    emailLabel: 'Email address (administrator)',
    emailPlaceholder: 'you@example.com',
    motDePasseLabel: 'Password',
    motDePasseIndice: 'At least 8 characters.',
    boutonEnCours: 'Creating…',
    dejaEspace: 'Already have a space?',
    erreurs: {
      nomRequis: 'Please enter your organization name.',
      motDePasseCourt: 'The password must contain at least 8 characters.',
      conflit: 'This space cannot be created with these details.',
      invalide: 'Some details are invalid. Please check the form.',
    },
  },
}
