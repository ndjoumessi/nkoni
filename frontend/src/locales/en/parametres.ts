/** EN strings of the organisation Settings screen (§5 i18n). Read-only (immutable params). */
export default {
  parametres: {
    overline: 'Organisation',
    titre: 'Settings',
    sousTitre: 'Your workspace details, as set when it was created.',
    erreur: 'Unable to load the organisation settings.',
    infos: {
      titre: 'Organisation details',
      nom: 'Organisation name',
      devise: 'Currency',
      langue: 'Default language',
      creation: 'Workspace created on',
      chef: 'Organisation head',
      chefNonDesigne: 'Not assigned',
    },
    immuable: {
      titre: 'Permanent settings',
      texte:
        'The name, currency and default language are set when the workspace is created and can no longer be changed. Each member can still choose their own display language under “My profile”.',
    },
    membres: {
      titre: 'Members',
      compteur_one: '{{count}} of {{limite}} members',
      compteur_other: '{{count}} of {{limite}} members',
      compteurIllimite_one: '{{count}} member',
      compteurIllimite_other: '{{count}} members',
      forfait: 'Free plan',
      illimite: 'Unlimited members',
      restants_one: '{{count}} seat remaining',
      restants_other: '{{count}} seats remaining',
      limiteAtteinte: 'Plan limit reached',
    },
  },
}
