import type { Document } from '../types'

/**
 * Guide du membre (spec 2026-09-18, tâche 3) — public visé : un membre SANS responsabilité
 * (rôle `MEMBRE_SIMPLE`). Dix sections, ids et ordre FIGÉS par le brief de la tâche.
 */
const membre: Document = {
  titre: 'Guide du membre',
  intro: "Ce que vous pouvez voir et faire dans NKONI en tant que membre.",
  sections: [
    {
      id: 'se-connecter',
      titre: 'Se connecter',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Pour votre première connexion, utilisez l'adresse e-mail et le mot de passe que le bureau de votre organisation vous a remis. Aucune inscription n'est nécessaire de votre côté.",
        },
        {
          type: 'etapes',
          etapes: [
            "Saisissez votre adresse e-mail dans « Adresse e-mail ».",
            "Saisissez votre mot de passe dans « Mot de passe ».",
            "Cochez « Se souvenir de moi » si vous voulez rester connecté plus longtemps sur cet appareil.",
            "Cliquez sur « Se connecter ».",
          ],
        },
        {
          type: 'etapes',
          etapes: [
            "Ouvrez « Mon profil ».",
            "Dans « Changer mon mot de passe », saisissez votre mot de passe actuel, puis le nouveau (au moins 8 caractères), puis sa confirmation.",
            "Cliquez sur « Mettre à jour le mot de passe ».",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Mot de passe oublié : vous ne pouvez pas le réinitialiser vous-même. Demandez à un administrateur de votre organisation de le faire pour vous.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Changer votre mot de passe met fin à toutes vos autres sessions ouvertes (par exemple sur un autre téléphone) : c'est volontaire, pour protéger votre compte.",
        },
      ],
    },
    {
      id: 'ma-situation',
      titre: 'Ma situation',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Sur « Mon espace », l'onglet « Aperçu » affiche trois montants : « Total dû », « Total versé » et « Reste à payer », avec une barre de progression.",
        },
        {
          type: 'paragraphe',
          texte:
            "Ces montants sont cumulés depuis votre année d'adhésion jusqu'à l'année en cours (ou jusqu'à votre fin de contribution, le cas échéant) — pas seulement l'année en cours.",
        },
        {
          type: 'liste',
          items: [
            "« Année » : l'année de cotisation.",
            "« Attendu » : le montant dû pour cette année, selon le barème.",
            "« Versé » : ce que vous avez versé pour cette année.",
            "« Valorisé » : le montant qui compte réellement pour votre statut (voir « Comprendre mon statut »).",
            "« Statut » : à jour, partiel ou non à jour, pour cette année.",
          ],
        },
        {
          type: 'lien',
          vers: '/mon-espace',
          libelle: 'Mon espace',
        },
      ],
    },
    {
      id: 'mon-statut',
      titre: 'Comprendre mon statut',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "« À jour » : le montant valorisé couvre tout ce qui est attendu jusqu'à cette année. « Partiel » : il n'en couvre qu'une partie. « Non à jour » : aucun montant n'est encore valorisé.",
        },
        {
          type: 'paragraphe',
          texte:
            "Le montant « Valorisé » est celui qui détermine votre statut — pas le montant versé. Les deux sont égaux la plupart du temps ; ils peuvent différer après un équilibrage fait par le bureau, qui répartit vos versements autrement entre les années sans changer leur somme.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Le statut porte sur le cumul depuis votre adhésion, pas sur la seule année en cours : un versement récent peut donc ne combler qu'une partie de ce qui est attendu au total, et votre statut peut rester « Partiel » ou « Non à jour » même après avoir payé.",
        },
      ],
    },
    {
      id: 'payer-en-ligne',
      titre: 'Payer en ligne',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le paiement en ligne n'apparaît que si votre organisation l'a configuré. Le bouton « Payer » se trouve sur chaque année dans l'onglet « Contributions » de « Mon espace ».",
        },
        {
          type: 'etapes',
          etapes: [
            "Ouvrez « Mon espace », onglet « Contributions ».",
            "Cliquez sur « Payer » pour l'année concernée.",
            "Saisissez le montant à payer (le reste dû est proposé par défaut ; un paiement partiel est possible, sans dépasser le reste dû).",
            "Cliquez sur « Payer » pour confirmer.",
          ],
        },
        {
          type: 'paragraphe',
          texte:
            "Selon le prestataire de votre organisation, vous êtes soit redirigé vers une page de paiement sécurisée, soit invité à valider le paiement directement sur votre téléphone (Mobile Money).",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Le montant est toujours plafonné à ce qu'il vous reste réellement à payer. Si le paiement n'aboutit pas, aucune somme n'est enregistrée : vous pouvez recommencer.",
        },
      ],
    },
    {
      id: 'mes-recus',
      titre: 'Mes reçus',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "L'onglet « Reçus » de « Mon espace » liste tous vos reçus : numéro, date et montant.",
        },
        {
          type: 'etapes',
          etapes: [
            "Cliquez sur « Voir » pour un aperçu du reçu dans l'application.",
            "Cliquez sur « Télécharger » pour enregistrer le PDF.",
          ],
        },
        {
          type: 'paragraphe',
          texte:
            "Le bureau peut aussi vous transmettre votre reçu directement par WhatsApp ou par e-mail, selon ce que votre organisation a configuré.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Un reçu annulé (marqué « Annulé ») ne peut plus être consulté ni téléchargé depuis l'application. Il reste listé pour la trace, et un reçu corrigé vous sera transmis par le bureau si besoin.",
        },
      ],
    },
    {
      id: 'reunions-et-votes',
      titre: 'Réunions et votes',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Les réunions à venir de votre organisation s'affichent sur l'onglet « Aperçu » de « Mon espace », avec la question « Serez-vous présent ? ».",
        },
        {
          type: 'etapes',
          etapes: [
            "Ouvrez « Mon espace ».",
            "Sous la réunion concernée, répondez « Présent », « Excusé » ou « Absent ».",
          ],
        },
        {
          type: 'paragraphe',
          texte:
            "« Votes en cours » liste les résolutions qu'un dirigeant a explicitement mises au vote. Répondez « Pour », « Contre » ou « Abstention ».",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Revoter remplace votre réponse précédente (présence comme vote) : seul votre dernier choix compte. Un vote n'est plus possible une fois la résolution clôturée.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Qui a voté quoi reste réservé au bureau : vous voyez qu'une résolution est ouverte au vote, mais pas le détail nominatif des votes des autres membres.",
        },
      ],
    },
    {
      id: 'ma-carte',
      titre: 'Ma carte de membre',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Votre carte de membre, avec son QR code, est visible sur l'onglet « Aperçu » de « Mon espace ». Le bouton « Télécharger le PDF » vous permet de l'enregistrer.",
        },
        {
          type: 'paragraphe',
          texte:
            "Le QR ouvre une page publique de vérification, consultable sans compte : elle affiche votre nom, votre branche, votre année d'adhésion et votre statut de cotisation (à jour, partiel ou non à jour).",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Cette page publique n'affiche jamais aucun montant : ni ce qui est attendu, ni ce que vous avez versé. Seul le statut est visible.",
        },
        {
          type: 'lien',
          vers: '/mon-espace',
          libelle: 'Mon espace',
        },
      ],
    },
    {
      id: 'notifications',
      titre: 'Notifications',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Dans « Mon profil », la section « Préférences de notification » propose trois types de notifications réglables séparément : « Versement enregistré », « Cotisation en retard » et « Rappel de réunion ».",
        },
        {
          type: 'paragraphe',
          texte:
            "« Notifications sur cet appareil » permet de recevoir ces rappels même quand l'application est fermée, si votre téléphone ou navigateur le prend en charge.",
        },
        {
          type: 'etapes',
          etapes: [
            "Ouvrez « Mon profil ».",
            "Sous « Notifications sur cet appareil », activez l'interrupteur.",
            "Acceptez la demande d'autorisation de votre téléphone ou navigateur.",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Si votre navigateur ne prend pas en charge les notifications, cet interrupteur n'apparaît pas : les trois préférences ci-dessus restent réglables normalement.",
        },
      ],
    },
    {
      id: 'hors-connexion',
      titre: 'Utiliser l’application sans réseau',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Sans connexion, les pages déjà chargées lors de votre dernière visite (votre situation, vos contributions, vos reçus…) restent consultables. Un indicateur « Hors ligne » apparaît alors dans l'application.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Les actions qui ont besoin du réseau — confirmer votre présence, voter, payer en ligne — sont refusées hors connexion et ne sont pas mises en attente automatiquement. Réessayez une fois le réseau revenu.",
        },
        {
          type: 'paragraphe',
          texte:
            "Dès que la connexion revient, rouvrir ou rafraîchir l'application récupère vos données à jour.",
        },
      ],
    },
    {
      id: 'mon-profil',
      titre: 'Mon profil',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "« Mon profil » affiche votre identité (adresse e-mail, rôle) en lecture seule.",
        },
        {
          type: 'etapes',
          etapes: [
            "Ouvrez « Mon profil ».",
            "Dans « Photo de profil », cliquez sur « Ajouter une photo » (ou « Changer la photo » si vous en avez déjà une).",
            "Choisissez une image JPEG ou PNG de 5 Mo maximum.",
          ],
        },
        {
          type: 'paragraphe',
          texte:
            "La « Langue de l'interface » se choisit entre Français et English : c'est une préférence personnelle, propre à votre compte, indépendante de la langue par défaut de votre organisation.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Vos coordonnées (téléphone…) ne se modifient pas depuis cette page : seul le bureau peut les mettre à jour sur votre fiche.",
        },
      ],
    },
  ],
}

export default membre
