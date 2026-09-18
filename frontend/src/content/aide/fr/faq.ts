import type { Document } from '../types'

const faq: Document = {
  titre: 'Questions fréquentes',
  intro: 'Les réponses aux situations les plus courantes.',
  sections: [
    {
      id: 'annee-non-encaissable',
      titre: 'Je ne peux pas enregistrer un versement sur une année',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Deux conditions sont nécessaires. D'abord, un barème doit exister pour cette année : sans montant attendu configuré, rien n'est encaissable. Ensuite, une contribution doit être ouverte pour ce membre sur cette année.",
        },
        {
          type: 'paragraphe',
          texte:
            "En pratique, vous n'avez rien à préparer à l'avance : le formulaire « Nouveau versement » ouvre l'année choisie à la volée pour ce membre, tant qu'un barème existe pour elle.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Cette ouverture à la volée peut malgré tout être refusée si l'année choisie est hors de la période de cotisation du membre : avant son année d'adhésion, ou après sa fin de contribution s'il en a une.",
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Barème annuel',
        },
      ],
    },
    {
      id: 'membre-non-a-jour-alors-quil-a-paye',
      titre: 'Un membre a payé mais reste « partiel »',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le statut ne porte pas sur la seule année en cours : il cumule ce qui est attendu depuis l'année d'adhésion du membre jusqu'à l'année en cours (ou jusqu'à sa fin de contribution). Un paiement récent peut donc ne combler qu'une partie de cet attendu cumulé.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Comparez « Total attendu (cumulé) » et « Total valorisé (cumulé) » sur la fiche du membre : c'est le montant VALORISÉ, pas le montant versé, qui détermine le statut. Les deux sont égaux, sauf après un équilibrage, qui répartit les versements différemment entre les années sans changer leur somme.",
        },
      ],
    },
    {
      id: 'modifier-un-versement',
      titre: 'Je ne peux pas modifier un versement',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Un versement dont le reçu est ACTIF (déjà généré et non annulé) ne peut plus être modifié : le reçu, une fois remis, ne doit pas se mettre à mentir sur un montant.",
        },
        {
          type: 'etapes',
          etapes: [
            'Sur la ligne du versement, cliquez sur « Annuler le reçu » (il garde son numéro, à titre de trace comptable).',
            'Modifier le versement.',
            'Générer un nouveau reçu si besoin.',
          ],
        },
      ],
    },
    {
      id: 'supprimer-un-versement',
      titre: 'Que devient le reçu si je supprime le versement ?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le reçu n'est pas supprimé : il est annulé, et reste listé, en trace, sous l'année du versement disparu. Son numéro est conservé et ne sera jamais réattribué à un autre reçu.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Comme pour une modification, supprimer le versement d'un reçu ACTIF exige d'abord d'annuler ce reçu.",
        },
      ],
    },
    {
      id: 'ajout-de-membre-bloque',
      titre: 'Je ne peux plus ajouter de membre',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le forfait Gratuit est plafonné à 50 membres ACTIFS. Les forfaits Pro et Entreprise sont illimités.",
        },
        {
          type: 'paragraphe',
          texte:
            "Une fiche INACTIVE ou DÉCÉDÉE ne compte pas dans ce plafond : seuls les membres actifs sont comptés, que ce soit à la création, à l'import ou à la réactivation d'une fiche.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Paramètres',
        },
      ],
    },
    {
      id: 'canal-denvoi-du-recu',
      titre: 'Par quel moyen le reçu est-il envoyé ?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "WhatsApp est essayé en premier. S'il ne délivre pas (numéro absent ou invalide, canal indisponible), l'e-mail prend le relais automatiquement.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Si le service d'envoi (WhatsApp ou e-mail) n'est pas disponible côté serveur, ou si le téléphone ou l'e-mail renseigné sur la fiche du membre est absent ou invalide, le reçu n'est envoyé par aucun canal — il reste toutefois disponible au téléchargement depuis l'application.",
        },
      ],
    },
    {
      id: 'reouvrir-une-annee',
      titre: "J'ai rouvert une année et rien ne s'est passé",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "L'ouverture d'une année est idempotente : rouvrir une année déjà ouverte pour tous les membres concernés ne recrée rien, d'où le message « Rien à créer ».",
        },
        {
          type: 'paragraphe',
          texte:
            "Rouvrir reste utile après coup : si des membres ont été ajoutés depuis la première ouverture, seuls ceux-là recevront une contribution pour cette année.",
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Ouvrir une année',
        },
      ],
    },
    {
      id: 'annee-future',
      titre: "Je ne peux pas ouvrir l'année prochaine",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Une année future ne peut pas être ouverte à la contribution : tant qu'elle n'est pas commencée, aucun montant n'est dû, et l'ouvrir la rendrait encaissable par erreur.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Configurer le barème de l'année prochaine, en revanche, reste permis : seule son ouverture attend l'échéance.",
        },
      ],
    },
    {
      id: 'mot-de-passe-oublie',
      titre: "J'ai oublié mon mot de passe",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Vous ne pouvez pas le réinitialiser vous-même : demandez à un administrateur de votre organisation de le faire depuis la page « Utilisateurs », sur votre compte.",
        },
        {
          type: 'lien',
          vers: '/utilisateurs',
          libelle: 'Utilisateurs',
        },
      ],
    },
    {
      id: 'connexion-refusee',
      titre: 'On me refuse la connexion, alors que je suis sûr de mon mot de passe',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Deux situations, distinctes d'un mot de passe oublié, empêchent toute connexion même avec les bons identifiants.",
        },
        {
          type: 'liste',
          items: [
            "Compte désactivé : un administrateur de votre organisation a désactivé votre compte. Demandez-lui de le réactiver depuis la page « Utilisateurs ».",
            "Espace suspendu : c'est l'organisation entière qui a été suspendue, pas votre compte. Dans ce cas, contactez directement le support NKONI.",
          ],
        },
        {
          type: 'lien',
          vers: '/utilisateurs',
          libelle: 'Utilisateurs',
        },
      ],
    },
    {
      id: 'sessions-et-deconnexion',
      titre: "Changer mon mot de passe m'a déconnecté partout",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "C'est voulu. Changer un mot de passe (le vôtre, ou une réinitialisation par un administrateur) met fin à toutes les autres sessions ouvertes.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Cette mesure protège le compte : si quelqu'un d'autre y était connecté sans votre accord, changer le mot de passe le déconnecte aussitôt.",
        },
      ],
    },
    {
      id: 'qui-voit-quoi',
      titre: 'Qui peut voir quoi ?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Pour un document, la visibilité est celle de l'élément auquel il est rattaché (une réunion, une dépense…) : un document n'a pas ses propres règles, il hérite de celles de son parent.",
        },
        {
          type: 'paragraphe',
          texte:
            "Le détail nominatif d'un vote (qui a voté quoi) n'est, lui, jamais visible d'un membre simple : seul le bureau peut le consulter, même si tout le monde peut voir qu'une résolution est ouverte au vote.",
        },
      ],
    },
    {
      id: 'donnees-et-suppression',
      titre: 'Puis-je récupérer ou supprimer mes données ?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Oui. Un administrateur ou le président peut exporter l'ensemble des données de l'organisation à tout moment, en libre-service.",
        },
        {
          type: 'paragraphe',
          texte:
            "La suppression définitive de l'organisation se fait sur demande auprès de NKONI et est irréversible : elle n'est possible qu'une fois l'organisation suspendue.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Exporter mes données',
        },
      ],
    },
  ],
}

export default faq
