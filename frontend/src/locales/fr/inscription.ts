/** Chaînes FR de la page d'auto-inscription (§4 i18n) — « Créer mon espace ». */
export default {
  inscription: {
    sousTitre: 'Créez l’espace sécurisé de votre communauté',
    accroche: 'Quelques informations pour démarrer. Vous en serez l’administrateur.',
    nomLabel: 'Nom de l’organisation',
    nomPlaceholder: 'Famille, amicale ou tontine…',
    deviseLabel: 'Devise',
    langueLabel: 'Langue',
    devises: {
      fcfa: 'FCFA (Franc CFA)',
      eur: 'EUR (Euro)',
      usd: 'USD (Dollar US)',
      cad: 'CAD (Dollar canadien)',
    },
    immuable: 'La devise et la langue sont définitives après création.',
    emailLabel: 'Adresse e-mail (administrateur)',
    emailPlaceholder: 'vous@exemple.com',
    motDePasseLabel: 'Mot de passe',
    motDePasseIndice: '8 caractères minimum.',
    boutonEnCours: 'Création…',
    dejaEspace: 'Vous avez déjà un espace ?',
    erreurs: {
      nomRequis: 'Veuillez saisir le nom de votre organisation.',
      motDePasseCourt: 'Le mot de passe doit contenir au moins 8 caractères.',
      conflit: 'Impossible de créer cet espace avec ces informations.',
      invalide: 'Certaines informations sont invalides. Vérifiez le formulaire.',
    },
  },
}
