import type { Document } from '../types'

/**
 * Committee guide (spec 2026-09-18, task 4) — audience: ADMIN, PRESIDENT, TREASURER, SECRETARY.
 * Thirteen sections, ids and order FIXED by the task brief, mirroring `../fr/bureau.ts`. Every
 * restricted action names the role that can perform it — verified in the code (matrix
 * `backend/src/middlewares/permissions.ts` and `requireRoles` guards / mirrors in
 * `frontend/src/lib/roles.ts`), not merely assumed.
 */
const bureau: Document = {
  titre: 'Committee guide',
  intro:
    'The management actions for your organisation: members, payments, receipts, treasury, community life and settings.',
  sections: [
    {
      id: 'mettre-en-route',
      titre: 'Setting up your space',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "A precise order avoids blockers: the fee schedule before contributions, contributions before recording payments. Here is the sequence that works.",
        },
        {
          type: 'etapes',
          etapes: [
            "Configure the year’s fee schedule on “Annual schedule”: the amount expected per member (Administrator only).",
            "Open the year for the whole organisation with the “Open the year” button (Administrator and Treasurer): this pre-creates every eligible member’s contribution. This step is optional — recording a payment on an unopened year opens it automatically for that member.",
            "Add your members, one at a time or by file import (Administrator and Secretary).",
            "If you wish, designate the organisation head from a member’s record (Administrator and President). This step is optional and can be done at any time.",
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "The “Annual schedule” page is not available to the Secretary (read access is reserved to Administrator, President, Treasurer and Auditor): the secretariat’s part starts at “Adding members”.",
        },
        {
          type: 'lien',
          vers: '/bareme',
          libelle: 'Annual schedule',
        },
      ],
    },
    {
      id: 'ajouter-des-membres',
      titre: 'Adding members',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Administrator and Secretary can create members, one at a time from “New member”, or all at once by importing a CSV or Excel file.',
        },
        {
          type: 'etapes',
          etapes: [
            'On “Import members”, choose your .csv, .xlsx or .xls file (the file is read by the server).',
            'Map the file columns to the expected fields (last name, first name and membership year are required).',
            'Check the preview: members to create, duplicates skipped, rows in error, and the remaining quota.',
            "Click “Confirm import” (no row is created before this confirmation).",
          ],
        },
        {
          type: 'liste',
          items: [
            'The Free plan limits the organisation to 50 ACTIVE members; the Pro and Enterprise plans are unlimited.',
            'The quota only counts members with ACTIVE status: a record created or imported as Inactive or Deceased does not consume it.',
            'The quota is checked on all three paths that add an active member: creation, import, and reactivating an existing record.',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "Beyond the plan’s quota, creation, import or reactivation are refused. An import is then blocked ENTIRELY (nothing is created) as long as the number of rows to create exceeds the remaining room.",
        },
        {
          type: 'lien',
          vers: '/membres/import',
          libelle: 'Import members',
        },
      ],
    },
    {
      id: 'encaisser-un-versement',
      titre: 'Recording a payment',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Recording, editing or deleting a payment is reserved to Administrator and Treasurer. President and Auditor can only view them.',
        },
        {
          type: 'liste',
          items: ['Available payment methods: “Cash”, “Third party”, “Mobile Money”, “Other”.'],
        },
        {
          type: 'etapes',
          etapes: [
            'From the member’s record, click “Record a payment”.',
            "Choose the year: the picker covers the member’s whole membership window, not only the years already open.",
            'Enter the amount, the date and the payment method.',
            'Click “Record the payment”.',
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            'Choosing a year that is not yet open opens it automatically, for that member only: there is no need to use “Open the year” beforehand.',
        },
      ],
    },
    {
      id: 'recus',
      titre: 'Generating and sending a receipt',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'A receipt is never generated automatically. Generating and reading a receipt is reserved to Administrator, President, Treasurer and Auditor — the Secretary has no access to it.',
        },
        {
          type: 'etapes',
          etapes: [
            'On the relevant payment row, click “Generate the receipt”.',
            'The receipt receives a sequential number, which will never be reused.',
            'Click “WhatsApp” to open your own WhatsApp with a pre-filled message and the download link, or “Send” for an automatic delivery by the server (WhatsApp first, email as a fallback).',
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            '“Download” opens the PDF inside the application. Automatic delivery (“Send”) depends on the sending service (WhatsApp or email) being available on the server, and on the phone number or email on the member’s record; if no channel is available, only “WhatsApp” (your own app) and “Download” remain available.',
        },
      ],
    },
    {
      id: 'corriger-une-erreur',
      titre: 'Fixing a mistake',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'A numbered receipt, potentially already handed to the member, is never edited or deleted directly. As long as an ACTIVE receipt exists for a payment, that payment can be NEITHER edited NOR deleted: it is the same guard for both actions.',
        },
        {
          type: 'etapes',
          etapes: [
            'On the payment row, click “Cancel receipt” (Administrator, President or Treasurer).',
            'The payment becomes editable and deletable again.',
            'Fix the payment (pencil button) if the payment itself needs to change, or delete it if you recorded the wrong member or year.',
            'Generate a new receipt if needed: it will carry a new number.',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'Cancelling a receipt is IRREVERSIBLE. The receipt keeps its number and accounting trace, but it can no longer be downloaded or shared — including by the member. It cannot be reactivated: only a new generation produces a valid receipt again, under a different number.',
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "A receipt link already sent over WhatsApp never expires on its own. Cancelling the receipt is therefore the ONLY way to stop a now-incorrect document from continuing to circulate: as soon as it is cancelled, that link stops working for everyone, including the member who received it.",
        },
        {
          type: 'liste',
          items: [
            "If you then delete the payment, the cancelled receipt is kept separately, as a read-only trace, under the member’s year.",
            'You can also choose not to delete the payment, and simply reissue a corrected receipt on that same payment.',
          ],
        },
      ],
    },
    {
      id: 'suivre-le-recouvrement',
      titre: 'Tracking collection',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'The dashboard shows your collection rate, the total collected, the total expected and what is left to collect. Its content depends on your role: Administrator and President see everything, Treasurer and Auditor see the same financial figures.',
        },
        {
          type: 'liste',
          items: ['“Total collected”', '“Total expected”', '“Left to collect”'],
        },
        {
          type: 'etapes',
          etapes: [
            'Look for the “To follow up” block, which lists active members who are partial or not up to date.',
            'Click the WhatsApp icon next to a member to open your own WhatsApp with a pre-filled follow-up message.',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "The Secretary sees NONE of this: their dashboard is restricted to structural data (members, branches), with no financial figures at all. The WhatsApp follow-up is also disabled in the demo space.",
        },
      ],
    },
    {
      id: 'tresorerie-et-depenses',
      titre: 'Treasury and expenses',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'An expense follows a fixed path: Draft → Pending → Approved or Rejected → Paid. Administrator, President and Treasurer create and edit expenses; the Secretary and the Auditor can only view the list.',
        },
        {
          type: 'etapes',
          etapes: [
            'Create the expense (it starts as a Draft), then submit it (“Pending”).',
            'An authorised role clicks “Approve” or “Reject”.',
            'Once approved, an authorised role clicks “Mark paid”.',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            '“Approve” and “Reject” are reserved to Administrator, President and Auditor. “Mark paid” is reserved to Administrator, President and Treasurer. These are two DIFFERENT roles: the Treasurer cannot approve an expense, and the Auditor cannot pay it.',
        },
        {
          type: 'paragraphe',
          texte:
            'The cash balance (“Treasury” page) is the sum of payments received, minus the sum of Approved or Paid expenses, with a breakdown by category.',
        },
        {
          type: 'lien',
          vers: '/tresorerie',
          libelle: 'Treasury',
        },
      ],
    },
    {
      id: 'vie-associative',
      titre: 'Meetings, resolutions and votes',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Administrator, President and Secretary create meetings and their agenda, and record resolutions there. An online vote runs in two EXPLICIT steps: a resolution stays purely documentary until it has been opened for voting.',
        },
        {
          type: 'etapes',
          etapes: [
            'Click “Open voting” on the relevant resolution (Administrator, President or Secretary).',
            'Members vote “For”, “Against” or “Abstain” from their own space.',
            'Click “Show results” to see the named tally.',
            'Click “Close voting” (Administrator, President or Secretary): the “Adopted” or “Rejected” status is then fixed according to the tally, and no further vote is accepted.',
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "“Show results” (who voted what) is reserved to the committee — Administrator, President, Secretary, Treasurer and Auditor — and is never visible to a simple member, even for a resolution open for voting.",
        },
        {
          type: 'paragraphe',
          texte:
            "A meeting’s PDF minutes are regenerated on every download from the saved text: they are never cached, unlike a receipt.",
        },
        {
          type: 'lien',
          vers: '/reunions',
          libelle: 'Meetings',
        },
      ],
    },
    {
      id: 'autres-caisses',
      titre: 'Event funds, fines and tontines',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'In short: event funds collect donations for an event (bereavement, wedding, birth) before payout to the beneficiary; fines track financial penalties through to collection; tontines organise rotating savings between members, round by round.',
        },
        {
          type: 'liste',
          items: [
            'Creating/editing an event fund, a fine or a tontine: Administrator, President, Treasurer and Secretary (the Secretary cannot delete).',
            'Money flows — recording a donation, paying out a fund, collecting a fine, recording or paying out a tontine contribution — are reserved to Administrator, President and Treasurer, even for the Secretary who manages the record.',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            "A tontine is NEVER part of the association’s treasury: the money it circulates belongs to the members among themselves (the contributions collected go entirely to that round’s beneficiary), it is not income for the organisation. It therefore does not appear in the cash balance.",
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
      titre: 'Accounts and roles',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'The “Users” page — creating an account, changing a role, resetting a password — is only available to the Administrator. Other committee roles do not see it.',
        },
        {
          type: 'etapes',
          etapes: [
            'On “Users”, click “Create an account”.',
            'Enter the email address, a temporary password, the role, and a linked member if needed.',
            'Click “Create the account”. To change a forgotten password, use “Reset” on the account’s row (no old password required).',
          ],
        },
        {
          type: 'liste',
          items: [
            'Administrator: full access to the whole organisation, including accounts.',
            'President: broad read and management access (meetings, votes, event funds, fines, tontines, expenses), plus money flows.',
            'Treasurer: payments, expenses and money flows for the other funds; read access to meetings and resolutions.',
            'Secretary: members, meetings and agenda, management (excluding money flows) of event funds/fines/tontines; read-only on organisation settings and on expenses; no access at all to payments, receipts, the fee schedule or exports.',
            'Auditor: broad financial read access, expense approval, receipt generation, vote tallying.',
          ],
        },
        {
          type: 'lien',
          vers: '/utilisateurs',
          libelle: 'Users',
        },
      ],
    },
    {
      id: 'forfait',
      titre: 'Your plan',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Your organisation’s plan is shown on “Settings”, visible to every committee role. The Free plan limits the organisation to 50 active members and 500 MB of documents, with no online payment. The Pro and Enterprise plans are unlimited (20 GB of documents) and include online payment.",
        },
        {
          type: 'paragraphe',
          texte:
            'A paid plan has an end date. As the date approaches (30 days or less), a banner invites you to renew. Past the end date, a 14-day grace period keeps every feature of the plan.',
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'Once the grace period elapses without renewal, the organisation automatically falls back to the Free plan’s limits (members, storage, online payment). Your data is never deleted or lost.',
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "A payment already settled by a member always stays recorded, even if the plan expired in the meantime: confirming a payment never depends on the plan’s state.",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Settings',
        },
      ],
    },
    {
      id: 'exports-et-rapports',
      titre: 'Exports and reports',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'You can export the contributions, and consult financial reports (trend, comparison between years, detail by member, collection) on the “Financial reports” page. Every export downloads as Excel or PDF.',
        },
        {
          type: 'liste',
          items: [
            'Access reserved to Administrator, President, Treasurer and Auditor.',
            'The Secretary has no access to any export or financial report.',
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "The exported document’s language follows your own interface preference (set in “My profile”), not necessarily your organisation’s default language.",
        },
        {
          type: 'lien',
          vers: '/rapports',
          libelle: 'Financial reports',
        },
        {
          type: 'paragraphe',
          texte:
            'The COMPLETE export of the organisation’s data (members, payments, receipts, expenses…) as a JSON file is done from “Settings”, “Export my data” section — reserved to the Administrator and the President, a narrower access than the financial exports and reports above.',
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Export my data',
        },
      ],
    },
    {
      id: 'parametres-immuables',
      titre: 'What cannot be changed',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "On “Settings”, your organisation’s name, currency and default language are fixed when your space is created: no page lets you change them afterwards.",
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "This choice protects the consistency of your data over time (amounts, dates, receipts already issued in that currency and language). Every user is still free to choose their own display language in “My profile”, independently of this organisation-wide setting.",
        },
        {
          type: 'paragraphe',
          texte:
            "This same page also shows, for information, the number of active members against your plan’s limit, and the organisation head if one has been designated — two read-only pieces of information, updated from their own screens (a member’s record for the head).",
        },
        {
          type: 'lien',
          vers: '/parametres',
          libelle: 'Settings',
        },
      ],
    },
  ],
}

export default bureau
