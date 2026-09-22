import { CONTACT_EMAIL } from '@/lib/contact'
import type { DocumentLegal } from '../types'

/**
 * Mentions légales (obligation LCEN, art. 6-III) — VERSION DE RÉFÉRENCE (celle qui fait foi),
 * reprise mot pour mot de la page JSX d'origine. Identifie l'ÉDITEUR, le DIRECTEUR DE LA
 * PUBLICATION et les HÉBERGEURS.
 *
 * Sources, et rien d'autre — document opposable, on ne publie pas de valeur fabriquée :
 * - éditeur : attestation d'immatriculation au Registre national des entreprises du 10/09/2026
 *   (siège 71 rue de Rome, 13001 Marseille), complétée le 14/09/2026 par les mentions légales
 *   publiées par le MÊME éditeur pour son service HabaShop (fournies par le PO) : entrepreneur
 *   individuel Nelson Djoumessi, SIREN 109 761 023, SIRET 109 761 023 00018, APE 6201Z,
 *   téléphone. Entrepreneur individuel ⇒ nom suivi de « EI » ou « entrepreneur individuel »
 *   (Code de commerce, art. R. 526-26).
 * - hébergeurs : identités relevées sur leurs propres CGU/politiques (12/09/2026) — Vercel Inc.
 *   (frontend + stockage des pièces jointes, Vercel Blob) et Railway Corporation (API + base
 *   PostgreSQL). Aucun des deux ne publie de numéro de téléphone : on renvoie à leur site.
 *   Resend et Sentry sont des SOUS-TRAITANTS, pas des hébergeurs : ils relèvent de la page
 *   confidentialité, pas d'ici.
 */
const document: DocumentLegal = {
  titre: 'Mentions légales',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'editeur',
      titre: '1. Éditeur du service',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Le service NKONI, accessible à l’adresse nkoni.vercel.app, est édité par Nelson Djoumessi EI, entrepreneur individuel immatriculé au Registre national des entreprises (RNE).',
          ],
        },
        {
          type: 'liste',
          items: [
            ['forme juridique : entreprise individuelle ;'],
            ['SIREN : 109 761 023 — SIRET : 109 761 023 00018 ;'],
            ['code APE : 6201Z ;'],
            ['siège : 71 rue de Rome, 13001 Marseille, France ;'],
            ['e-mail : ', { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` }, ' ;'],
            ['téléphone : ', { texte: '+33 6 61 75 19 23', vers: 'tel:+33661751923' }, '.'],
          ],
        },
      ],
    },
    {
      id: 'directeur-publication',
      titre: '2. Directeur de la publication',
      blocs: [
        {
          type: 'paragraphe',
          contenu: ['Nelson Djoumessi, en qualité d’entrepreneur individuel éditeur du service.'],
        },
      ],
    },
    {
      id: 'hebergement',
      titre: '3. Hébergement',
      blocs: [
        { type: 'paragraphe', contenu: ['Le service est hébergé par les prestataires suivants :'] },
        { type: 'sousTitre', texte: 'Application web et stockage des pièces jointes' },
        {
          type: 'paragraphe',
          contenu: [
            'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — ',
            { texte: 'vercel.com', vers: 'https://vercel.com' },
          ],
        },
        { type: 'sousTitre', texte: 'Serveur applicatif et base de données' },
        {
          type: 'paragraphe',
          contenu: [
            'Railway Corporation, 548 Market St PMB 68956, San Francisco, CA 94104, États-Unis — ',
            { texte: 'railway.com', vers: 'https://railway.com' },
          ],
        },
      ],
    },
    {
      id: 'propriete-intellectuelle',
      titre: '4. Propriété intellectuelle',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Le nom NKONI, son logo, son interface et son code sont la propriété de l’éditeur. Toute reproduction ou réutilisation sans autorisation est interdite.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Les données saisies par une organisation dans son espace restent sa propriété, dans les conditions prévues par les ',
            { texte: 'conditions générales d’utilisation', vers: '/cgu' },
            '.',
          ],
        },
      ],
    },
    {
      id: 'donnees-personnelles',
      titre: '5. Données personnelles',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Le traitement des données personnelles, les sous-traitants auxquels nous faisons appel et l’exercice de vos droits sont décrits dans notre ',
            { texte: 'politique de confidentialité', vers: '/confidentialite' },
            '.',
          ],
        },
      ],
    },
  ],
}

export default document
