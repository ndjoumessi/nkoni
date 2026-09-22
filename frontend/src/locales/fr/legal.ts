/**
 * Coquille i18n des pages LÉGALES (`/cgu`, `/confidentialite`, `/mentions-legales`) — libellés
 * d'interface SEULEMENT. Le CORPS juridique ne passe jamais par ce catalogue : il vit dans
 * `content/legal/`, chargé à la demande (cf. `content/legal/types.ts`).
 *
 * `avisTraduction` est le point qui compte : le français est la seule version qui fasse foi,
 * l'anglais est une traduction de courtoisie. Cette phrase est affichée par `RenduLegal` dès que
 * le texte lu n'est pas le français.
 */
export default {
  legal: {
    majLe: 'Dernière mise à jour : {{date}}',
    chargementTitre: 'Document légal',
    chargement: 'Chargement du document…',
    erreurTitre: 'Chargement impossible',
    erreurDescription: 'Ce document n’a pas pu être chargé. Vérifiez votre connexion et réessayez.',
    avisTraduction:
      'Traduction de courtoisie. Seule la version française fait foi : en cas de divergence, c’est elle qui s’applique.',
  },
}
