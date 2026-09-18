/** Aide contextuelle (spec 2026-09-17) — FR source de vérité. Vouvoiement, 3 phrases au plus. */
export default {
  aide: {
    libelleBouton: 'Aide : {{titre}}',
    nouvelOnglet: '(s’ouvre dans un nouvel onglet)',
    enSavoirPlus: 'En savoir plus',
    notions: {
      bareme: {
        titre: 'Barème annuel',
        texte:
          "Montant de cotisation fixé pour une année. Il sert à calculer ce que chaque membre doit pour cette année-là. Vous pouvez le configurer à l’avance, mais l’année ne s’ouvre qu’une fois commencée.",
      },
      ouvrirAnnee: {
        titre: 'Ouvrir une année',
        texte:
          "Prépare en une fois la cotisation de l’année pour tous les membres concernés, c’est-à-dire ceux dont l’année est comprise entre leur adhésion et leur fin de contribution, au montant du barème. Ce n’est pas obligatoire pour encaisser : un versement sur une année non ouverte l’ouvre pour le membre concerné. Une année future ne peut pas être ouverte.",
      },
      attendu: {
        titre: 'Total attendu',
        texte:
          "Ce que les membres doivent au total : le barème de chaque année, depuis l’année d’adhésion de chaque membre jusqu’à l’année en cours ou jusqu’à sa fin de contribution.",
      },
      verse: {
        titre: 'Total collecté',
        texte:
          "L’argent encaissé par les versements enregistrés. L’écart avec le total attendu est le reste à collecter.",
      },
      valorise: {
        titre: 'Montant valorisé',
        texte:
          "C’est le montant qui compte pour le statut de cotisation. Il est égal au montant versé, sauf après un équilibrage, qui répartit autrement les versements entre les années sans changer le total.",
      },
      statutCotisation: {
        titre: 'Statut de cotisation',
        texte:
          "À jour : le montant valorisé couvre tout ce qui est attendu jusqu’à cette année. Partiel : il en couvre une partie. Non à jour : aucun montant n’est encore valorisé.",
      },
      equilibrage: {
        titre: 'Équilibrage',
        texte:
          "Répartit ce qu’un membre a déjà versé entre plusieurs années, par exemple pour solder une année ancienne. Il ne crée ni ne retire d’argent : le total reste le même, seule la répartition change.",
      },
      anneeAdhesion: {
        titre: "Année d’adhésion",
        texte: 'Première année pour laquelle le membre doit cotiser. Les années précédentes ne lui sont pas réclamées.',
      },
      finContribution: {
        titre: 'Fin de contribution',
        texte:
          "Dernière année due par le membre. Elle se remplit automatiquement lorsqu’il devient inactif ou décède, et son historique est conservé.",
      },
      chefSousFamille: {
        titre: 'Chef de sous-famille',
        texte:
          'Membre de référence de la sous-famille à laquelle ce membre est rattaché. Il permet de regrouper les membres d’une même sous-famille.',
      },
      chefOrganisation: {
        titre: "Chef de l’organisation",
        texte:
          "Dirigeant désigné de l’organisation, affiché avec son surnom. Un administrateur ou le président le désigne depuis la fiche du membre.",
      },
      recus: {
        titre: 'Reçus',
        texte:
          "Vous pouvez générer un reçu numéroté pour chaque versement (« Générer le reçu »), puis le télécharger ou l’envoyer au membre par les canaux configurés. Pour corriger un versement, annulez d’abord son reçu : il garde son numéro et ne peut plus être partagé. Corrigez ensuite le versement, puis générez un nouveau reçu.",
      },
      circuitDepense: {
        titre: "Circuit d’une dépense",
        texte:
          "Une dépense passe de brouillon à en attente, puis elle est approuvée ou rejetée, et enfin payée. L’approbation revient à l’administrateur, au président ou au commissaire aux comptes. Le paiement revient à l’administrateur, au président ou à la trésorière.",
      },
      modeRotation: {
        titre: 'Mode de rotation',
        texte:
          "Ordre fixe : l’ordre des bénéficiaires est fixé dès l’ouverture du cycle. Tirage : à chaque tour, un bénéficiaire est tiré au sort parmi ceux qui n’ont pas encore reçu. Le mode enchère n’est pas encore disponible.",
      },
      cagnotte: {
        titre: 'Cagnotte',
        texte:
          'Collecte ponctuelle pour un événement (mariage, deuil…), avec un objectif et des dons. Elle est suivie à part des cotisations annuelles.',
      },
      voteResolution: {
        titre: "Vote d’une résolution",
        texte:
          "Un dirigeant ouvre le vote, puis chaque membre vote pour, contre ou s’abstient. À la clôture, la résolution est adoptée si les « pour » sont plus nombreux que les « contre ». Les abstentions ne comptent pas.",
      },
      forfaitEcheance: {
        titre: 'Forfait et échéance',
        texte:
          "Le forfait fixe les capacités de l’espace (nombre de membres, stockage, paiement en ligne). À l’échéance, une période de grâce de 14 jours s’ouvre. Ensuite, l’espace repasse au forfait Gratuit sans perdre ses données.",
      },
    },
  },
}
