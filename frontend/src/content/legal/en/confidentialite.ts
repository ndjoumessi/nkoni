import { CONTACT_EMAIL } from '@/lib/contact'
import type { DocumentLegal } from '../types'

/**
 * Privacy Policy (GDPR) — COURTESY TRANSLATION. The French version is the only binding one
 * (`../fr/confidentialite.ts`) ; `RenduLegal` affiche cet avertissement en tête de page. La
 * structure (identifiants et séquence de blocs) est tenue identique au français par
 * `legal-parite.test.ts`. **À faire relire par un juriste** avec la version française (GA 0.3).
 */
const document: DocumentLegal = {
  titre: 'Privacy Policy',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'responsable',
      titre: '1. Who is responsible for your data',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'NKONI is a service for managing contributions and financial transparency for associations, extended families and tontines. The data controller is Nelson Djoumessi EI, a sole trader registered with the French national business register under SIREN number 109 761 023, whose registered office is at 71 rue de Rome, 13001 Marseille, France (hereinafter “we”).',
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'We process personal data in compliance with the General Data Protection Regulation (GDPR) and any applicable regulations, which we apply as a baseline of protection for all of our users.',
          ],
        },
      ],
    },
    {
      id: 'donnees-traitees',
      titre: '2. What data we process',
      blocs: [
        { type: 'paragraphe', contenu: ['Depending on your role, we process the following categories of data:'] },
        { type: 'sousTitre', texte: 'Account data (signed-in users)' },
        {
          type: 'liste',
          items: [
            ['email address and password (stored in an encrypted, irreversible form, never in plain text);'],
            ['role, organisation, language and notification preferences.'],
          ],
        },
        { type: 'sousTitre', texte: 'Member data (entered by the organisation)' },
        {
          type: 'liste',
          items: [
            ['identity: last name, first name, sex, date of birth;'],
            ['contact details: phone number, email, address;'],
            ['affiliation: family branch, role in the association, year of joining, status;'],
            ['the member’s photograph, where provided.'],
          ],
        },
        { type: 'sousTitre', texte: 'Financial data' },
        {
          type: 'liste',
          items: [
            ['expected contributions, payments, receipts, expenses, collections and fines;'],
            ['the related history and supporting documents.'],
          ],
        },
        { type: 'sousTitre', texte: 'Technical data' },
        {
          type: 'liste',
          items: [
            ['sign-in and activity logs required for security and traceability;'],
            ['in the event of an application error, an anonymised technical report (without personal content).'],
          ],
        },
      ],
    },
    {
      id: 'finalites',
      titre: '3. Why we process it (purposes and legal bases)',
      blocs: [
        {
          type: 'liste',
          items: [
            [
              'to provide the service (managing contributions, receipts, dashboards) — ',
              { accent: 'performance of the contract' },
              ';',
            ],
            ['to secure accounts and prevent misuse — ', { accent: 'legitimate interest' }, ';'],
            ['to comply with our accounting and legal obligations — ', { accent: 'legal obligation' }, ';'],
            [
              'to send receipts and contribution reminders by WhatsApp or email — ',
              { accent: 'performance of the contract' },
              ', in accordance with the recipient’s notification preferences.',
            ],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Members who do not have an account are added by their organisation, which is responsible for the lawfulness of the collection of the data it enters.',
          ],
        },
      ],
    },
    {
      id: 'acces',
      titre: '4. Who has access to your data',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Each organisation has a ',
            { accent: 'strictly isolated' },
            ' space: its data is accessible only to its own authorised members, according to their role. We neither sell nor rent your data, and we do not share it for advertising purposes.',
          ],
        },
        {
          type: 'paragraphe',
          contenu: ['We use technical subprocessors solely in order to operate the service:'],
        },
        {
          type: 'liste',
          items: [
            ['hosting of the application and of the database (cloud infrastructure providers);'],
            ['storage of attachments (photographs, documents, receipts) in a private space;'],
            ['sending of transactional emails (receipts, notifications);'],
            ['sending of WhatsApp messages, where that channel is enabled;'],
            ['technical error monitoring, without personal data.'],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'Some of these providers may host data outside the European Union. Where applicable, such transfers are governed by appropriate safeguards (standard contractual clauses or equivalent mechanisms).',
          ],
        },
      ],
    },
    {
      id: 'conservation',
      titre: '5. How long we keep it',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Your data is kept for as long as your organisation’s space is active. Upon closure of the space, it is permanently deleted within a maximum of ',
            { accent: '30 days' },
            ', with the exception of data that we are legally required to keep for longer (for example certain records of accounting value). A committee officer may export their organisation’s data at any time from the settings.',
          ],
        },
      ],
    },
    {
      id: 'vos-droits',
      titre: '6. Your rights',
      blocs: [
        {
          type: 'paragraphe',
          contenu: ['Under the GDPR, you have the following rights over your personal data:'],
        },
        {
          type: 'liste',
          items: [
            ['the right of access and rectification;'],
            ['the right to erasure (the “right to be forgotten”);'],
            ['the right to portability (export of your data in a readable format);'],
            ['the right to object to and to restrict processing;'],
            ['the right to give directions on what becomes of your data after your death.'],
          ],
        },
        {
          type: 'paragraphe',
          contenu: [
            'To exercise these rights, write to us at ',
            { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` },
            '. You also have the right to lodge a complaint with the competent data protection supervisory authority.',
          ],
        },
      ],
    },
    {
      id: 'securite',
      titre: '7. How we protect your data',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'Security is at the heart of the service: strict isolation between organisations, encryption of communications (HTTPS), encrypted and irreversible storage of passwords, private storage of attachments (never publicly exposed), and logging of sensitive actions. As no system is infallible, we undertake to inform you without delay of any incident affecting your data, in accordance with the regulations.',
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
            'NKONI uses only the cookies that are ',
            { accent: 'strictly necessary' },
            ' for it to work — mainly a secure session cookie that keeps you signed in. We do not use advertising cookies or third-party trackers.',
          ],
        },
      ],
    },
    {
      id: 'modifications',
      titre: '9. Changes',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'We may update this policy. Any substantial change will be brought to your attention, and the date of the latest update appears at the top of the page. For any question, please contact us at ',
            { texte: CONTACT_EMAIL, vers: `mailto:${CONTACT_EMAIL}` },
            '.',
          ],
        },
      ],
    },
  ],
}

export default document
