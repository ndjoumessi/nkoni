import type { Document } from '../types'

/**
 * Guide du bureau (spec 2026-09-18, tâche 4) — public visé : ADMIN, PRÉSIDENT, TRÉSORIÈRE,
 * SECRÉTAIRE. Treize sections, ids et ordre FIGÉS par le brief de la tâche. Chaque action
 * réservée nomme le rôle qui peut l'accomplir — vérifié dans le code (matrice
 * `backend/src/middlewares/permissions.ts` et gardes `requireRoles`/miroirs `frontend/src/lib/roles.ts`),
 * pas seulement supposé.
 */
const bureau: Document = {
  titre: 'Guide du bureau',
  intro:
    "Les actions de gestion de votre organisation : membres, versements, reçus, trésorerie, vie associative et paramètres.",
  sections: [
    {
      id: 'mettre-en-route',
      titre: 'Mettre en route votre espace',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Un ordre précis évite les blocages : le barème avant les cotisations, les cotisations avant l'encaissement. Voici l'enchaînement qui marche.",
        },
        {
          type: 'etapes',
          etapes: [
            "Configurez le barème de l'année sur « Barème » : montant attendu par membre (ADMIN uniquement).",
            "Ouvrez l'année pour toute l'organisation avec le bouton « Ouvrir l'année » (ADMIN et TRÉSORIÈRE) : cela crée d'avance la cotisation de chaque membre éligible. Cette étape est facultative — encaisser un versement sur une année non ouverte l'ouvre automatiquement pour ce membre.",
            "Ajoutez vos membres, un par un ou par import de fichier (ADMIN et SECRÉTAIRE).",
            "Désignez, si vous le souhaitez, le chef de l'organisation depuis la fiche d'un membre (ADMIN et PRÉSIDENT). Cette étape est facultative et peut se faire à tout moment.",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "La page « Barème » n'est pas accessible au SECRÉTAIRE (lecture réservée à ADMIN, PRÉSIDENT, TRÉSORIÈRE et COMMISSAIRE AUX COMPTES) : le secrétariat prend le relais à l'étape « Ajouter des membres ».",
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Barème',
        },
      ],
    },
    {
      id: 'ajouter-des-membres',
      titre: 'Ajouter des membres',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "ADMIN et SECRÉTAIRE peuvent créer des membres, un par un depuis « Nouveau membre », ou en une fois par import d'un fichier CSV ou Excel.",
        },
        {
          type: 'etapes',
          etapes: [
            "Sur « Importer des membres », choisissez votre fichier .csv, .xlsx ou .xls (le fichier est lu par le serveur).",
            "Associez les colonnes du fichier aux champs attendus (nom, prénom, année d'adhésion sont obligatoires).",
            "Vérifiez l'aperçu : membres à créer, doublons ignorés, lignes en erreur, et le quota restant.",
            "Cliquez sur « Confirmer l'import » (aucune ligne n'est créée avant cette confirmation).",
          ],
        },
        {
          type: 'liste',
          items: [
            "Le forfait Gratuit limite l'organisation à 50 membres ACTIFS ; les forfaits Pro et Entreprise sont illimités.",
            "Le quota ne compte que les membres au statut ACTIF : une fiche créée ou importée en statut Inactif ou Décédé ne le consomme pas.",
            "Le quota se contrôle sur les trois voies qui ajoutent un membre actif : création, import, et réactivation d'une fiche existante.",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Au-delà du quota du forfait, la création, l'import ou la réactivation sont refusés. Un import est alors bloqué EN ENTIER (rien n'est créé) tant que le nombre de lignes à créer dépasse la place restante.",
        },
        {
          type: 'lien',
          vers: '/membres/import',
          libelle: 'Importer des membres',
        },
      ],
    },
    {
      id: 'encaisser-un-versement',
      titre: 'Encaisser un versement',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Enregistrer, modifier ou supprimer un versement est réservé à ADMIN et TRÉSORIÈRE. PRÉSIDENT et COMMISSAIRE AUX COMPTES peuvent seulement consulter.",
        },
        {
          type: 'liste',
          items: [
            'Modes de paiement disponibles : « Espèces », « Tiers », « Mobile Money », « Autre ».',
          ],
        },
        {
          type: 'etapes',
          etapes: [
            "Depuis la fiche du membre, cliquez sur « Saisir un versement ».",
            "Choisissez l'année : le sélecteur couvre toute la fenêtre d'adhésion du membre, pas seulement les années déjà ouvertes.",
            "Renseignez le montant, la date et le mode de paiement.",
            "Cliquez sur « Enregistrer le versement ».",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Choisir une année non encore ouverte l'ouvre automatiquement, pour ce membre uniquement : inutile de passer par « Ouvrir l'année » au préalable.",
        },
      ],
    },
    {
      id: 'recus',
      titre: 'Générer et envoyer un reçu',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Un reçu n'est jamais généré automatiquement. Générer et lire un reçu est réservé à ADMIN, PRÉSIDENT, TRÉSORIÈRE et COMMISSAIRE AUX COMPTES — le SECRÉTAIRE n'y a pas accès.",
        },
        {
          type: 'etapes',
          etapes: [
            "Sur la ligne du versement concerné, cliquez sur « Générer le reçu ».",
            "Le reçu reçoit un numéro séquentiel, qui ne sera jamais réutilisé.",
            "Cliquez sur « WhatsApp » pour ouvrir votre propre WhatsApp avec un message pré-rempli et le lien de téléchargement, ou sur « Envoyer » pour un envoi automatique par le serveur (WhatsApp d'abord, e-mail en repli).",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "« Télécharger » ouvre le PDF dans l'application. L'envoi automatique (« Envoyer ») dépend de la configuration WhatsApp ou e-mail de votre organisation ; sans aucun canal configuré, seuls « WhatsApp » (votre propre application) et « Télécharger » restent disponibles.",
        },
      ],
    },
    {
      id: 'corriger-une-erreur',
      titre: 'Corriger une erreur',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Un reçu numéroté, potentiellement déjà remis au membre, ne se modifie ni ne se supprime jamais directement. Tant qu'un reçu ACTIF existe pour un versement, ce versement ne peut être NI modifié NI supprimé : c'est la même garde pour les deux actions.",
        },
        {
          type: 'etapes',
          etapes: [
            "Sur la ligne du versement, cliquez sur « Annuler le reçu » (ADMIN, PRÉSIDENT ou TRÉSORIÈRE).",
            "Le versement redevient modifiable et supprimable.",
            "Corrigez le versement (bouton crayon) si le versement lui-même doit changer, ou supprimez-le si vous vous étiez trompé de membre ou d'année.",
            "Générez un nouveau reçu si nécessaire : il portera un nouveau numéro.",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Annuler un reçu est IRRÉVERSIBLE. Le reçu garde son numéro et sa trace comptable, mais il n'est plus téléchargeable ni partageable — y compris pour le membre. Il ne peut pas être réactivé : seule une nouvelle génération produit un reçu à nouveau valide, sous un numéro différent.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Un lien de reçu déjà transmis par WhatsApp ne périme jamais de lui-même. Annuler le reçu est donc le SEUL moyen d'empêcher un document désormais incorrect de continuer à circuler : dès l'annulation, ce lien cesse de fonctionner pour tout le monde, y compris le membre qui l'a reçu.",
        },
        {
          type: 'liste',
          items: [
            "Si vous supprimez ensuite le versement, le reçu annulé est conservé à part, en trace de lecture seule, sous l'année du membre.",
            "Vous pouvez aussi choisir de ne pas supprimer le versement, et simplement réémettre un reçu corrigé sur ce même versement.",
          ],
        },
      ],
    },
    {
      id: 'suivre-le-recouvrement',
      titre: 'Suivre le recouvrement',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le tableau de bord affiche votre taux de recouvrement, le total collecté, le total attendu et le reste à collecter. Son contenu dépend de votre rôle : ADMIN et PRÉSIDENT voient tout, TRÉSORIÈRE et COMMISSAIRE AUX COMPTES voient les mêmes chiffres financiers.",
        },
        {
          type: 'liste',
          items: ['« Total collecté »', '« Total attendu »', '« Reste à collecter »'],
        },
        {
          type: 'etapes',
          etapes: [
            "Repérez le bloc « À relancer », qui liste les membres actifs non à jour ou partiels.",
            "Cliquez sur l'icône WhatsApp à côté d'un membre pour ouvrir votre propre WhatsApp avec un message de relance pré-rempli.",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Le SECRÉTAIRE ne voit AUCUNE de ces informations : son tableau de bord est restreint aux données structurelles (membres, branches), sans aucun chiffre financier. La relance WhatsApp est aussi désactivée dans l'espace de démonstration.",
        },
      ],
    },
    {
      id: 'tresorerie-et-depenses',
      titre: 'Trésorerie et dépenses',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Une dépense suit un circuit fixe : Brouillon → En attente → Approuvée ou Rejetée → Payée. ADMIN, PRÉSIDENT et TRÉSORIÈRE créent et modifient les dépenses ; le SECRÉTAIRE et le COMMISSAIRE AUX COMPTES peuvent seulement consulter la liste.",
        },
        {
          type: 'etapes',
          etapes: [
            "Créez la dépense (elle démarre en Brouillon), puis soumettez-la (« En attente »).",
            "Un rôle habilité clique sur « Approuver » ou « Rejeter ».",
            "Une fois approuvée, un rôle habilité clique sur « Marquer payée ».",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "« Approuver » et « Rejeter » sont réservés à ADMIN, PRÉSIDENT et COMMISSAIRE AUX COMPTES. « Marquer payée » est réservé à ADMIN, PRÉSIDENT et TRÉSORIÈRE. Ce sont deux rôles DIFFÉRENTS : la TRÉSORIÈRE ne peut pas approuver une dépense, et le COMMISSAIRE AUX COMPTES ne peut pas la payer.",
        },
        {
          type: 'paragraphe',
          texte:
            "Le solde de caisse (page « Trésorerie ») est la somme des versements reçus, moins la somme des dépenses Approuvées ou Payées, avec une ventilation par catégorie.",
        },
        {
          type: 'lien',
          vers: '/tresorerie',
          libelle: 'Trésorerie',
        },
      ],
    },
    {
      id: 'vie-associative',
      titre: 'Réunions, résolutions et votes',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "ADMIN, PRÉSIDENT et SECRÉTAIRE créent les réunions et leur ordre du jour, et y consignent les résolutions. Un vote en ligne se déroule en deux temps EXPLICITES : une résolution reste purement documentaire tant qu'elle n'a pas été mise au vote.",
        },
        {
          type: 'etapes',
          etapes: [
            "Cliquez sur « Ouvrir le vote » sur la résolution concernée (ADMIN, PRÉSIDENT ou SECRÉTAIRE).",
            "Les membres votent « Pour », « Contre » ou « Abstention » depuis leur espace.",
            "Cliquez sur « Dépouiller » pour voir le décompte nominatif.",
            "Cliquez sur « Clôturer le vote » (ADMIN, PRÉSIDENT ou SECRÉTAIRE) : le statut « Adoptée » ou « Rejetée » est alors fixé selon le décompte, et plus aucun vote n'est accepté.",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "« Dépouiller » (qui a voté quoi) est réservé au bureau — ADMIN, PRÉSIDENT, SECRÉTAIRE, TRÉSORIÈRE et COMMISSAIRE AUX COMPTES — et n'est jamais visible d'un membre simple, même pour une résolution ouverte au vote.",
        },
        {
          type: 'paragraphe',
          texte:
            "Le compte-rendu PDF d'une réunion est régénéré à chaque téléchargement à partir du texte enregistré : il n'est jamais mis en cache, contrairement à un reçu.",
        },
        {
          type: 'lien',
          vers: '/reunions',
          libelle: 'Réunions',
        },
      ],
    },
    {
      id: 'autres-caisses',
      titre: 'Cagnottes, amendes et tontines',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "En bref : les cagnottes collectent des dons pour un événement (deuil, mariage, naissance) avant reversement au bénéficiaire ; les amendes suivent des pénalités financières jusqu'à leur encaissement ; les tontines organisent une épargne rotative entre membres, tour par tour.",
        },
        {
          type: 'liste',
          items: [
            "Créer/modifier une cagnotte, une amende ou une tontine : ADMIN, PRÉSIDENT, TRÉSORIÈRE et SECRÉTAIRE (le SECRÉTAIRE ne peut pas supprimer).",
            "Les flux d'argent — enregistrer un don, reverser une cagnotte, encaisser une amende, enregistrer ou reverser une mise de tontine — sont réservés à ADMIN, PRÉSIDENT et TRÉSORIÈRE, même pour le SECRÉTAIRE qui gère la fiche.",
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Une tontine ne fait JAMAIS partie de la trésorerie de l'association : l'argent qu'elle fait circuler appartient aux membres entre eux (les mises collectées ressortent intégralement au bénéficiaire du tour), ce n'est pas un revenu de l'organisation. Elle n'apparaît donc pas dans le solde de caisse.",
        },
        {
          type: 'lien',
          vers: '/tontines',
          libelle: 'Tontines',
        },
      ],
    },
    {
      id: 'comptes-et-roles',
      titre: 'Comptes et rôles',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "La page « Utilisateurs » — créer un compte, changer un rôle, réinitialiser un mot de passe — n'est accessible qu'à ADMIN. Les autres rôles du bureau ne la voient pas.",
        },
        {
          type: 'etapes',
          etapes: [
            "Sur « Utilisateurs », cliquez sur « Créer un compte ».",
            "Renseignez l'adresse e-mail, un mot de passe temporaire, le rôle, et un membre lié si besoin.",
            "Cliquez sur « Créer le compte ». Pour changer un mot de passe oublié, utilisez « Réinitialiser » sur la ligne du compte concerné (aucun ancien mot de passe requis).",
          ],
        },
        {
          type: 'liste',
          items: [
            "ADMIN : accès complet à toute l'organisation, y compris les comptes.",
            "PRÉSIDENT : accès large en lecture et en gestion (réunions, votes, cagnottes, amendes, tontines, dépenses), plus les flux d'argent.",
            "TRÉSORIÈRE : versements, dépenses et flux d'argent des autres caisses ; lecture des réunions et résolutions.",
            "SECRÉTAIRE : membres, réunions et ordre du jour, gestion (hors flux d'argent) des cagnottes/amendes/tontines ; lecture seule sur les paramètres de l'organisation et sur les dépenses ; aucun accès aux versements, aux reçus, au barème ni aux exports.",
            "COMMISSAIRE AUX COMPTES : lecture financière large, approbation des dépenses, génération de reçus, dépouillement des votes.",
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
      id: 'forfait',
      titre: 'Votre forfait',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Le forfait de votre organisation se consulte sur « Paramètres », visible par tous les rôles du bureau. Le forfait Gratuit limite l'organisation à 50 membres actifs et 500 Mo de documents, sans paiement en ligne. Les forfaits Pro et Entreprise sont illimités (20 Go de documents) et incluent le paiement en ligne.",
        },
        {
          type: 'paragraphe',
          texte:
            "Un forfait payant a une échéance. À l'approche de la date (30 jours ou moins), un bandeau vous invite à renouveler. Passé l'échéance, une période de grâce de 14 jours conserve toutes les fonctionnalités du forfait.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Une fois la période de grâce écoulée sans renouvellement, l'organisation retombe automatiquement sur les limites du forfait Gratuit (membres, stockage, paiement en ligne). Vos données ne sont jamais supprimées ni perdues.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Un versement déjà réglé par un membre reste toujours enregistré, même si le forfait a expiré entre-temps : l'encaissement d'un paiement ne dépend jamais de l'état du forfait.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Paramètres',
        },
      ],
    },
    {
      id: 'exports-et-rapports',
      titre: 'Exports et rapports',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Vous pouvez exporter les contributions, et consulter des rapports financiers (évolution, comparaison entre années, détail par membre, recouvrement) sur la page « Rapports financiers ». Chaque export se télécharge au format Excel ou PDF.",
        },
        {
          type: 'liste',
          items: [
            "Accès réservé à ADMIN, PRÉSIDENT, TRÉSORIÈRE et COMMISSAIRE AUX COMPTES.",
            "Le SECRÉTAIRE n'a accès à aucun export ni rapport financier.",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "La langue du document exporté suit votre propre préférence d'interface (réglée dans « Mon profil »), pas nécessairement la langue par défaut de votre organisation.",
        },
        {
          type: 'lien',
          vers: '/rapports',
          libelle: 'Rapports financiers',
        },
      ],
    },
    {
      id: 'parametres-immuables',
      titre: 'Ce qui ne se change pas',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Sur « Paramètres », le nom de l'organisation, sa devise et sa langue par défaut sont fixés à la création de votre espace : aucune page ne permet de les modifier ensuite.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Ce choix protège la cohérence de vos données dans le temps (montants, dates, reçus déjà émis dans cette devise et cette langue). Chaque utilisateur garde néanmoins la liberté de choisir sa propre langue d'affichage dans « Mon profil », indépendamment de ce réglage d'organisation.",
        },
        {
          type: 'paragraphe',
          texte:
            "Cette même page affiche, à titre informatif, le nombre de membres actifs face à la limite de votre forfait, et le chef de l'organisation s'il a été désigné — deux informations en lecture seule, à mettre à jour depuis leurs propres écrans (fiche membre pour le chef).",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Paramètres',
        },
      ],
    },
  ],
}

export default bureau
