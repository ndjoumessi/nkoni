/**
 * Coquille i18n de la documentation publique (`/aide`, spec 2026-09-18) — namespace `aideDoc`,
 * DISTINCT de `aide` (aide contextuelle, déjà pris). Titres de navigation et libellés d'interface
 * SEULEMENT : le CONTENU des guides ne passe jamais par ce catalogue (cf. `content/aide/registre.ts`).
 */
export default {
  aideDoc: {
    titre: 'Aide',
    intro: 'Guides d’utilisation et réponses aux questions fréquentes.',
    retour: 'Accueil',
    sommaire: 'Sommaire',
    chargement: 'Chargement de l’aide…',
    erreurTitre: 'Chargement impossible',
    erreurDescription: 'Ce guide n’a pas pu être chargé. Vérifiez votre connexion et réessayez.',
    guides: {
      membre: {
        titre: 'Guide du membre',
        description: 'Consulter sa situation, payer, ses reçus, voter.',
      },
      bureau: {
        titre: 'Guide du bureau',
        description: 'Mettre en route, encaisser, justifier, piloter.',
      },
      faq: {
        titre: 'Questions fréquentes',
        description: 'Les blocages les plus courants, expliqués.',
      },
    },
  },
}
