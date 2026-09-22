import { CONTACT_EMAIL } from '@/lib/contact'
import type { DocumentLegal } from '../types'

/**
 * Terms of Use — COURTESY TRANSLATION. The French version is the only binding one (`../fr/cgu.ts`) ;
 * `RenduLegal` affiche cet avertissement en tête de page. La structure (identifiants et séquence de
 * blocs) est tenue identique au français par `legal-parite.test.ts` : une section ajoutée d'un côté
 * et pas de l'autre casse le test. **À faire relire par un juriste** avec la version française
 * (bloquant GA 0.3). Vocabulaire aligné sur la documentation anglaise : « space », « contributions ».
 */
const document: DocumentLegal = {
  titre: 'Terms of Use',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'objet',
      titre: '1. Purpose',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'These terms govern the use of NKONI, a service for managing contributions and financial transparency for associations, extended families and tontines, published by Nelson Djoumessi EI, sole trader (SIREN 109 761 023), whose registered office is at 71 rue de Rome, 13001 Marseille, France (hereinafter “we”). By creating a space or using the service, you accept these terms.',
          ],
        },
      ],
    },
    {
      id: 'compte-et-inscription',
      titre: '2. Account and registration',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Registration creates a space for your organisation and an administrator account. You are responsible for the accuracy of the information provided, for the confidentiality of your credentials and for any activity carried out from your account. You must inform us without delay of any unauthorised use.',
          ],
        },
      ],
    },
    {
      id: 'utilisation-du-service',
      titre: '3. Use of the service',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'You undertake to use NKONI lawfully and in accordance with its purpose. In particular, when you enter your members’ data, you warrant that you are entitled to do so and that you are responsible, as your organisation’s data controller, for the lawfulness of that collection and for informing your members.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'It is prohibited in particular to attempt to access another organisation’s data, to disrupt the service, or to use it for fraudulent purposes.',
          ],
        },
      ],
    },
    {
      id: 'forfaits',
      titre: '4. Plans',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'NKONI offers three plans: Free, Pro and Enterprise. Transparency towards members (their situation, receipts, member space and membership card) is included in every plan. The Free plan is limited to 50 active members and 500 MB of document storage. The Pro and Enterprise plans lift the member limit, raise storage to 20 GB and include online payment of contributions by Mobile Money; the Enterprise plan adds support and annual invoicing.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Plans are currently assigned by us on request, without online payment of the plan itself. A paid plan runs until an expiry date; once it expires, its features remain active during a 14-day grace period, after which the organisation returns to the limits of the Free plan. No data is deleted at that point: existing members and documents remain viewable and exportable, and only the addition of members or documents beyond the limits, and online payment, are suspended. An organisation that had configured online payment before these limits were introduced keeps it.',
          ],
        },
      ],
    },
    {
      id: 'propriete-des-donnees',
      titre: '5. Ownership of and responsibility for data',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'The data entered in your space remains the property of your organisation. We act as a technical provider to host and process it in accordance with your instructions and our ',
            { texte: 'privacy policy', vers: '/confidentialite' },
            '. A committee officer may export all of the organisation’s data at any time.',
          ],
        },
      ],
    },
    {
      id: 'disponibilite',
      titre: '6. Availability and changes',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'We endeavour to ensure the availability and reliability of the service, without however guaranteeing uninterrupted operation. We may change, suspend or limit certain features, in particular for maintenance or security reasons. Data is backed up regularly, which does not relieve you of exporting your data if you wish to keep a copy of it.',
          ],
        },
      ],
    },
    {
      id: 'responsabilite',
      titre: '7. Limitation of liability',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'NKONI is a management aid. You remain responsible for the accuracy of the information you enter and for the decisions you take on that basis. To the extent permitted by law, we cannot be held liable for indirect damages arising from the use of, or the inability to use, the service.',
          ],
        },
      ],
    },
    {
      id: 'resiliation',
      titre: '8. Termination and closure',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'You may request the closure of your space at any time. Upon closure, your data is permanently deleted within the period stated in our privacy policy. We recommend that you export your data beforehand. We reserve the right to suspend or close a space in the event of a serious breach of these terms.',
          ],
        },
      ],
    },
    {
      id: 'droit-applicable',
      titre: '9. Governing law and disputes',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'These terms are governed by the law applicable at the publisher’s registered office (French law). In the event of a dispute, an amicable solution will be sought as a priority; failing that, the competent courts will be those designated by the applicable regulations.',
          ],
        },
      ],
    },
    {
      id: 'contact',
      titre: '10. Contact',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'For any question about these terms, please contact us at ',
            { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` },
            '.',
          ],
        },
      ],
    },
  ],
}

export default document
