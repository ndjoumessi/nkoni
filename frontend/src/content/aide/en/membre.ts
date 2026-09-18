import type { Document } from '../types'

/**
 * Member guide (spec 2026-09-18, task 3) — audience: a member with NO management responsibility
 * (`MEMBRE_SIMPLE` role). Ten sections, ids and order FIXED by the task brief, matching `fr/membre.ts`.
 */
const membre: Document = {
  titre: 'Member guide',
  intro: 'What you can see and do in NKONI as a member.',
  sections: [
    {
      id: 'se-connecter',
      titre: 'Signing in',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "For your first sign-in, use the email address and password your organisation's office gave you. You don't need to register yourself.",
        },
        {
          type: 'etapes',
          etapes: [
            'Enter your email address in "Email address".',
            'Enter your password in "Password".',
            'Check "Remember me" if you want to stay signed in longer on this device.',
            'Click "Sign in".',
          ],
        },
        {
          type: 'etapes',
          etapes: [
            'Open "My profile".',
            'Under "Change my password", enter your current password, then your new one (at least 8 characters), then confirm it.',
            'Click "Update password".',
          ],
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'Forgot your password: you cannot reset it yourself. Ask an administrator of your organisation to do it for you.',
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            'Changing your password ends every other session you have open (for example on another phone): this is intentional, to protect your account.',
        },
      ],
    },
    {
      id: 'ma-situation',
      titre: 'My situation',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'On "My space", the "Overview" tab shows three amounts: "Total due", "Total paid" and "Left to pay", with a progress bar.',
        },
        {
          type: 'paragraphe',
          texte:
            "These amounts are cumulated from your join year up to the current year (or up to the end of your contribution, if applicable) — not just the current year.",
        },
        {
          type: 'liste',
          items: [
            '"Year": the contribution year.',
            '"Expected": the amount due for that year, per the schedule.',
            '"Paid": what you have paid for that year.',
            '"Valued": the amount that actually counts for your status (see "Understanding my status").',
            '"Status": up to date, partial, or not up to date, for that year.',
          ],
        },
        {
          type: 'lien',
          vers: '/mon-espace',
          libelle: 'My space',
        },
      ],
    },
    {
      id: 'mon-statut',
      titre: 'Understanding my status',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            '"Up to date": the valued amount covers everything expected up to this year. "Partial": it only covers part of it. "Not up to date": no amount has been valued yet.',
        },
        {
          type: 'paragraphe',
          texte:
            'The "Valued" amount is what determines your status — not the amount paid. The two are equal most of the time; they can differ after a rebalancing done by the office, which spreads your payments differently across years without changing their sum.',
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            'The status looks at the total since you joined, not just the current year: a recent payment may therefore only fill part of what is expected overall, and your status can stay "Partial" even after paying.',
        },
      ],
    },
    {
      id: 'payer-en-ligne',
      titre: 'Paying online',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Online payment only appears if your organisation has configured it. The "Pay" button sits on each year in the "Contributions" tab of "My space".',
        },
        {
          type: 'etapes',
          etapes: [
            'Open "My space", "Contributions" tab.',
            'Click "Pay" for the relevant year.',
            'Enter the amount to pay (the remaining balance is suggested by default; a partial payment is possible, as long as it does not exceed the remaining balance).',
            'Click "Pay" to confirm.',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            "Depending on your organisation's provider, you are either redirected to a secure payment page, or asked to approve the payment directly on your phone (Mobile Money).",
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'The amount is always capped at what you actually still owe. If the payment does not go through, nothing is recorded: you can try again.',
        },
      ],
    },
    {
      id: 'mes-recus',
      titre: 'My receipts',
      blocs: [
        {
          type: 'paragraphe',
          texte: 'The "Receipts" tab of "My space" lists all your receipts: number, date and amount.',
        },
        {
          type: 'etapes',
          etapes: [
            'Click "View" for a preview of the receipt inside the app.',
            'Click "Download" to save the PDF.',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'The office can also send your receipt directly by WhatsApp or by email, depending on the availability of the sending service and the phone number or email on your record.',
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'A cancelled receipt (marked "Cancelled") can no longer be viewed or downloaded from the app. It stays listed for the record, and the office will send you a corrected receipt if needed.',
        },
      ],
    },
    {
      id: 'reunions-et-votes',
      titre: 'Meetings and votes',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            "Your organisation's upcoming meetings show on the \"Overview\" tab of \"My space\", with the question \"Will you attend?\".",
        },
        {
          type: 'etapes',
          etapes: [
            'Open "My space".',
            'Under the relevant meeting, answer "Attending", "Excused" or "Absent".',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            '"Open votes" lists the resolutions a committee member has explicitly put to a vote. Answer "For", "Against" or "Abstain".',
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'Voting again replaces your previous answer (attendance as well as votes): only your last choice counts. Voting is no longer possible once the resolution is closed.',
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            "Who voted what stays reserved to the committee: you can see that a resolution is open for voting, but not the named detail of other members' votes.",
        },
      ],
    },
    {
      id: 'ma-carte',
      titre: 'My member card',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Your member card, with its QR code, is visible on the "Overview" tab of "My space". The "Download the PDF" button lets you save it.',
        },
        {
          type: 'paragraphe',
          texte:
            'The QR code opens a public verification page, viewable without an account: it shows your name, your branch, your join year and your contribution status (up to date, partial, or not up to date).',
        },
        {
          type: 'note',
          ton: 'info',
          texte: 'This public page never shows any amount: neither what is expected nor what you have paid. Only the status is visible.',
        },
        {
          type: 'lien',
          vers: '/mon-espace',
          libelle: 'My space',
        },
      ],
    },
    {
      id: 'notifications',
      titre: 'Notification settings',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'In "My profile", the "Notification preferences" section offers three notification types you can toggle separately: "Payment recorded", "Contribution overdue" and "Meeting reminder".',
        },
        {
          type: 'paragraphe',
          texte:
            '"Notifications on this device" lets you receive these reminders even when the app is closed, if your phone or browser supports it.',
        },
        {
          type: 'etapes',
          etapes: [
            'Open "My profile".',
            'Under "Notifications on this device", turn the toggle on.',
            'Accept the permission request from your phone or browser.',
          ],
        },
        {
          type: 'note',
          ton: 'info',
          texte:
            'If your browser does not support notifications, this toggle does not appear: the three preferences above remain adjustable as usual.',
        },
      ],
    },
    {
      id: 'hors-connexion',
      titre: 'Using the app offline',
      blocs: [
        {
          type: 'paragraphe',
          texte:
            'Without a connection, pages already loaded during your last visit (your situation, your contributions, your receipts…) remain viewable. An "Offline" indicator then appears in the app.',
        },
        {
          type: 'note',
          ton: 'attention',
          texte:
            'Actions that need the network — confirming your attendance, voting, paying online — are refused while offline and are not queued automatically. Try again once your connection is back.',
        },
        {
          type: 'paragraphe',
          texte: 'As soon as the connection returns, reopening or refreshing the app fetches your up-to-date data again.',
        },
      ],
    },
    {
      id: 'mon-profil',
      titre: 'My profile',
      blocs: [
        {
          type: 'paragraphe',
          texte: '"My profile" shows your identity (email address, role) as read-only.',
        },
        {
          type: 'etapes',
          etapes: [
            'Open "My profile".',
            'Under "Profile photo", click "Add a photo" (or "Change photo" if you already have one).',
            'Choose a JPEG or PNG image, 5 MB maximum.',
          ],
        },
        {
          type: 'paragraphe',
          texte:
            'The "Interface language" is chosen between Français and English: it is a personal preference, tied to your account, independent of your organisation\'s default language.',
        },
        {
          type: 'note',
          ton: 'info',
          texte: 'Your contact details (phone…) cannot be changed from this page: only the office can update them on your member record.',
        },
      ],
    },
  ],
}

export default membre
