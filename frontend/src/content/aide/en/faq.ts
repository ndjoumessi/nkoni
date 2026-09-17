import type { Document } from '../types'

const faq: Document = {
  titre: 'Frequently asked questions',
  intro: 'Answers to the most common situations.',
  sections: [
    {
      id: 'annee-non-encaissable',
      titre: "I can't record a payment for a year",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Two conditions are needed. First, a schedule must exist for that year: without an expected amount configured, nothing can be collected. Second, a contribution must be open for that member on that year.",
        },
        {
          type: 'paragraphe',
          texte:
            "In practice you don't need to prepare anything in advance: the “New payment” form opens the chosen year on the fly for that member, as long as a schedule exists for it.",
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Annual schedule',
        },
      ],
    },
    {
      id: 'membre-non-a-jour-alors-quil-a-paye',
      titre: 'A member paid but is still marked "not up to date"',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "The status doesn't only look at the current year: it cumulates what is expected from the member's join year up to the current year (or up to the end of their contribution). A recent payment may only fill part of that cumulative expectation.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            'Compare "Total expected (cumulative)" and "Total valued (cumulative)" on the member\'s record: it is the VALUED amount, not the amount paid, that determines the status. The two are equal, except after a rebalancing, which spreads payments differently across years without changing their sum.',
        },
      ],
    },
    {
      id: 'modifier-un-versement',
      titre: "I can't edit a payment",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "A payment whose receipt is ACTIVE (already generated and not cancelled) can no longer be edited: a receipt, once handed over, must not start lying about an amount.",
        },
        {
          type: 'etapes',
          etapes: [
            'Cancel the receipt from the payment record (it keeps its number, as an accounting trace).',
            'Edit the payment.',
            'Generate a new receipt if needed.',
          ],
        },
      ],
    },
    {
      id: 'supprimer-un-versement',
      titre: 'What happens to the receipt if I delete the payment?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "The receipt is not deleted: it stays visible, read-only, under the year of the payment that disappeared. Its number is kept and will never be reused for another receipt.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "As with editing, deleting the payment behind an ACTIVE receipt requires cancelling that receipt first.",
        },
      ],
    },
    {
      id: 'ajout-de-membre-bloque',
      titre: "I can't add any more members",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'The Free plan is capped at 50 ACTIVE members. Pro and Enterprise plans are unlimited.',
        },
        {
          type: 'paragraphe',
          texte:
            "An INACTIVE or DECEASED record doesn't count towards this cap: only active members are counted, whether on creation, import, or reactivation of a record.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Settings',
        },
      ],
    },
    {
      id: 'canal-denvoi-du-recu',
      titre: 'How is the receipt sent?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "WhatsApp is tried first. If it fails to deliver (missing or invalid phone number, channel unavailable), email automatically takes over.",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "If neither WhatsApp nor email is configured for your organisation, the receipt is not sent through any channel — it remains available for download from the app.",
        },
      ],
    },
    {
      id: 'reouvrir-une-annee',
      titre: 'I reopened a year and nothing happened',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Opening a year is idempotent: reopening a year already open for every concerned member creates nothing, hence the "Nothing to create" message.',
        },
        {
          type: 'paragraphe',
          texte:
            'Reopening remains useful afterwards: if members were added since the first opening, only those will receive a contribution for that year.',
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Open a year',
        },
      ],
    },
    {
      id: 'annee-future',
      titre: "I can't open next year",
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "A future year cannot be opened for contribution: as long as it hasn't started, nothing is due, and opening it would make it collectible by mistake.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Configuring next year's schedule, however, remains allowed: only its opening waits for the year to start.",
        },
      ],
    },
    {
      id: 'mot-de-passe-oublie',
      titre: 'I forgot my password',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'You cannot reset it yourself: ask an administrator of your organisation to do it from the "Users" page, on your account.',
        },
        {
          type: 'lien',
          vers: '/utilisateurs',
          libelle: 'Users',
        },
      ],
    },
    {
      id: 'sessions-et-deconnexion',
      titre: 'Changing my password signed me out everywhere',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "This is intentional. Changing a password (yours, or a reset by an administrator) ends every other open session.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "This protects the account: if someone else was signed in without your consent, changing the password signs them out immediately.",
        },
      ],
    },
    {
      id: 'qui-voit-quoi',
      titre: 'Who can see what?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "A document's visibility follows the item it is attached to (a meeting, an expense…): a document has no rules of its own, it inherits those of its parent.",
        },
        {
          type: 'paragraphe',
          texte:
            "The nominative detail of a vote (who voted what) is never visible to a plain member: only the committee can view it, even though everyone can see that a resolution is open for voting.",
        },
      ],
    },
    {
      id: 'donnees-et-suppression',
      titre: 'Can I retrieve or delete my data?',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Yes. An administrator or the president can export all of the organisation\'s data at any time, self-service.',
        },
        {
          type: 'paragraphe',
          texte:
            "Permanently deleting the organisation is done on request to NKONI and is irreversible: it is only possible once the organisation has been suspended.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Export my data',
        },
      ],
    },
  ],
}

export default faq
