import { CONTACT_EMAIL } from '@/lib/contact'
import type { DocumentLegal } from '../types'

/**
 * Politique de confidentialité (RGPD) — VERSION DE RÉFÉRENCE (celle qui fait foi), reprise mot pour
 * mot de la page JSX d'origine (bloquant GA 0.3). Contenu ancré sur les traitements RÉELS du
 * logiciel ; identité du responsable alignée sur l'attestation d'immatriculation au Registre
 * national des entreprises (10/09/2026). **À faire RELIRE par un juriste**, comme la traduction
 * anglaise. Ne JAMAIS publier ici une valeur non sourcée : document opposable.
 */
const document: DocumentLegal = {
  titre: 'Politique de confidentialité',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'responsable',
      titre: '1. Qui est responsable de vos données',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'NKONI est un service de gestion des cotisations et de transparence financière pour associations, familles élargies et tontines. Le responsable du traitement est Nelson Djoumessi EI, entrepreneur individuel immatriculé au Registre national des entreprises sous le numéro SIREN 109 761 023, dont le siège est situé 71 rue de Rome, 13001 Marseille, France (ci-après « nous »).',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Nous traitons les données personnelles dans le respect du Règlement général sur la protection des données (RGPD) et de toute réglementation applicable, que nous appliquons comme socle de protection à l’ensemble de nos utilisateurs.',
          ],
        },
      ],
    },
    {
      id: 'donnees-traitees',
      titre: '2. Quelles données nous traitons',
      blocs: [
        { type: 'paragraphe', contenu: ['Selon votre rôle, nous traitons les catégories de données suivantes :'] },
        { type: 'sousTitre', texte: 'Données de compte (utilisateurs connectés)' },
        {
          type: 'liste',
          items: [
            ['adresse e-mail et mot de passe (stocké de façon chiffrée et irréversible, jamais en clair) ;'],
            ['rôle, organisation de rattachement, langue et préférences de notification.'],
          ],
        },
        { type: 'sousTitre', texte: 'Données des membres (saisies par l’organisation)' },
        {
          type: 'liste',
          items: [
            ['identité : nom, prénom, sexe, date de naissance ;'],
            ['coordonnées : téléphone, e-mail, adresse ;'],
            ['rattachement : branche familiale, fonction sociale, année d’adhésion, statut ;'],
            ['photographie du membre, lorsqu’elle est fournie.'],
          ],
        },
        { type: 'sousTitre', texte: 'Données financières' },
        {
          type: 'liste',
          items: [
            ['cotisations attendues, versements, reçus, dépenses, cagnottes et amendes ;'],
            ['historique et documents justificatifs associés.'],
          ],
        },
        { type: 'sousTitre', texte: 'Données techniques' },
        {
          type: 'liste',
          items: [
            ['journaux de connexion et d’activité nécessaires à la sécurité et à la traçabilité ;'],
            ['en cas d’erreur applicative, un rapport technique anonymisé (sans contenu personnel).'],
          ],
        },
      ],
    },
    {
      id: 'finalites',
      titre: '3. Pourquoi nous les traitons (finalités et bases légales)',
      blocs: [
        {
          type: 'liste',
          items: [
            [
              'fournir le service (gestion des cotisations, reçus, tableaux de bord) — ',
              { accent: 'exécution du contrat' },
              ' ;',
            ],
            ['sécuriser les comptes et prévenir les usages abusifs — ', { accent: 'intérêt légitime' }, ' ;'],
            ['respecter nos obligations comptables et légales — ', { accent: 'obligation légale' }, ' ;'],
            [
              'envoyer des reçus et relances de cotisation par WhatsApp ou e-mail — ',
              { accent: 'exécution du contrat' },
              ', dans le respect des préférences de notification du destinataire.',
            ],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Les membres n’ayant pas de compte sont ajoutés par leur organisation, qui est responsable de la licéité de la collecte des données qu’elle saisit.',
          ],
        },
      ],
    },
    {
      id: 'acces',
      titre: '4. Qui a accès à vos données',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Chaque organisation dispose d’un espace ',
            { accent: 'strictement isolé' },
            ' : ses données ne sont accessibles qu’à ses propres membres autorisés, selon leur rôle. Nous ne vendons ni ne louons vos données, et ne les partageons pas à des fins publicitaires.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: ['Nous faisons appel à des sous-traitants techniques, uniquement pour opérer le service :'],
        },
        {
          type: 'liste',
          items: [
            ['hébergement de l’application et de la base de données (fournisseurs d’infrastructure cloud) ;'],
            ['stockage des pièces jointes (photos, documents, reçus) sur un espace privé ;'],
            ['envoi d’e-mails transactionnels (reçus, notifications) ;'],
            ['envoi de messages WhatsApp, lorsque ce canal est activé ;'],
            ['supervision technique des erreurs, sans données personnelles.'],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Certains de ces prestataires peuvent héberger des données hors de l’Union européenne. Le cas échéant, ces transferts sont encadrés par des garanties appropriées (clauses contractuelles types ou mécanismes équivalents).',
          ],
        },
      ],
    },
    {
      id: 'conservation',
      titre: '5. Combien de temps nous les conservons',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Vos données sont conservées tant que l’espace de votre organisation est actif. À la clôture de l’espace, elles sont définitivement supprimées dans un délai maximum de ',
            { accent: '30 jours' },
            ', à l’exception des données que nous sommes légalement tenus de conserver plus longtemps (par exemple certaines pièces à valeur comptable). Un dirigeant peut à tout moment exporter les données de son organisation depuis les paramètres.',
          ],
        },
      ],
    },
    {
      id: 'vos-droits',
      titre: '6. Vos droits',
      blocs: [
        {
          type: 'paragraphe',
          contenu: ['Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :'],
        },
        {
          type: 'liste',
          items: [
            ['droit d’accès et de rectification ;'],
            ['droit à l’effacement (« droit à l’oubli ») ;'],
            ['droit à la portabilité (export de vos données dans un format lisible) ;'],
            ['droit d’opposition et de limitation du traitement ;'],
            ['droit de définir des directives sur le sort de vos données après votre décès.'],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Pour exercer ces droits, écrivez-nous à ',
            { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` },
            '. Vous disposez également du droit d’introduire une réclamation auprès de l’autorité de contrôle compétente en matière de protection des données.',
          ],
        },
      ],
    },
    {
      id: 'securite',
      titre: '7. Comment nous protégeons vos données',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'La sécurité est au cœur du service : isolation stricte entre organisations, chiffrement des communications (HTTPS), stockage chiffré et irréversible des mots de passe, stockage privé des pièces jointes (jamais exposées publiquement), et journalisation des actions sensibles. Aucun système n’étant infaillible, nous nous engageons à vous informer sans délai en cas d’incident affectant vos données, conformément à la réglementation.',
          ],
        },
      ],
    },
    {
      id: 'cookies',
      titre: '8. Cookies',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'NKONI n’utilise que les cookies ',
            { accent: 'strictement nécessaires' },
            ' à son fonctionnement — principalement un cookie sécurisé de session permettant de vous garder connecté. Nous n’utilisons pas de cookies publicitaires ni de traceurs tiers.',
          ],
        },
      ],
    },
    {
      id: 'modifications',
      titre: '9. Modifications',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Nous pouvons faire évoluer la présente politique. Toute modification substantielle sera portée à votre connaissance, et la date de dernière mise à jour figure en tête de page. Pour toute question, contactez-nous à ',
            { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` },
            '.',
          ],
        },
      ],
    },
  ],
}

export default document
