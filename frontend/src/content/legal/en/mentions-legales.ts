import { CONTACT_EMAIL } from '@/lib/contact'
import type { DocumentLegal } from '../types'

/**
 * Legal notice — COURTESY TRANSLATION. The French version is the only binding one
 * (`../fr/mentions-legales.ts`) : ces mentions répondent à une obligation du DROIT FRANÇAIS (LCEN,
 * art. 6-III) et n'ont d'effet qu'en droit français. Traduites malgré tout (décision PO du
 * 2026-09-22) pour ne pas laisser une page mi-anglaise mi-française — que ni un lecteur anglophone
 * ni un lecteur d'écran ne traitaient correctement.
 *
 * **Les valeurs légales ne se traduisent PAS** : raison sociale, SIREN/SIRET, code APE, adresses des
 * hébergeurs sont reprises À L'IDENTIQUE — les transposer en dirait plus que la source. Seul le
 * texte qui les entoure passe en anglais. **À faire relire par un juriste** avec le français (0.3).
 */
const document: DocumentLegal = {
  titre: 'Legal notice',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'editeur',
      titre: '1. Publisher of the service',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'The NKONI service, available at nkoni.vercel.app, is published by Nelson Djoumessi EI, a sole trader registered with the French national business register (RNE).',
          ],
        },
        {
          type: 'liste',
          items: [
            ['legal form: entreprise individuelle (sole trader);'],
            ['SIREN: 109 761 023 — SIRET: 109 761 023 00018;'],
            ['APE code: 6201Z;'],
            ['registered office: 71 rue de Rome, 13001 Marseille, France;'],
            ['email: ', { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` }, ';'],
            ['telephone: ', { texte: '+33 6 61 75 19 23', vers: 'tel:+33661751923' }, '.'],
          ],
        },
      ],
    },
    {
      id: 'directeur-publication',
      titre: '2. Publication director',
      blocs: [
        {
          type: 'paragraphe',
          contenu: ['Nelson Djoumessi, as the sole trader publishing the service.'],
        },
      ],
    },
    {
      id: 'hebergement',
      titre: '3. Hosting',
      blocs: [
        { type: 'paragraphe', contenu: ['The service is hosted by the following providers:'] },
        { type: 'sousTitre', texte: 'Web application and storage of attachments' },
        {
          type: 'paragraphe',
          contenu: [
            'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States — ',
            { texte: 'vercel.com', vers: 'https://vercel.com' },
          ],
        },
        { type: 'sousTitre', texte: 'Application server and database' },
        {
          type: 'paragraphe',
          contenu: [
            'Railway Corporation, 548 Market St PMB 68956, San Francisco, CA 94104, United States — ',
            { texte: 'railway.com', vers: 'https://railway.com' },
          ],
        },
      ],
    },
    {
      id: 'propriete-intellectuelle',
      titre: '4. Intellectual property',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'The NKONI name, its logo, its interface and its code are the property of the publisher. Any reproduction or reuse without authorisation is prohibited.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'The data entered by an organisation in its space remains its property, under the conditions set out in the ',
            { texte: 'terms of use', vers: '/cgu' },
            '.',
          ],
        },
      ],
    },
    {
      id: 'donnees-personnelles',
      titre: '5. Personal data',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'The processing of personal data, the subprocessors we use and the exercise of your rights are described in our ',
            { texte: 'privacy policy', vers: '/confidentialite' },
            '.',
          ],
        },
      ],
    },
  ],
}

export default document
