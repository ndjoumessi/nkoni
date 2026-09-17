/** EN mirror of the contextual help namespace (spec 2026-09-17). At most 3 sentences. */
export default {
  aide: {
    libelleBouton: 'Help: {{titre}}',
    enSavoirPlus: 'Learn more',
    notions: {
      bareme: {
        titre: 'Annual fee schedule',
        texte:
          'The contribution amount set for a year. It is used to work out what each member owes for that year. You can set it in advance, but the year can only be opened once it has started.',
      },
      ouvrirAnnee: {
        titre: 'Open a year',
        texte:
          "Prepares the year's contribution for every active member at once, at the schedule amount. It is not required to record payments: a payment for a year that is not open opens it for that member. A future year cannot be opened.",
      },
      attendu: {
        titre: 'Total expected',
        texte:
          "What members owe in total: each year's schedule, from each member's joining year up to the current year or to their contribution end year.",
      },
      verse: {
        titre: 'Total collected',
        texte: 'The money received through recorded payments. The gap with the total expected is what remains to collect.',
      },
      valorise: {
        titre: 'Credited amount',
        texte:
          'This is the amount that counts for the contribution status. It equals the amount paid, except after a rebalancing, which spreads payments differently across years without changing the total.',
      },
      statutCotisation: {
        titre: 'Contribution status',
        texte:
          'Up to date: the credited amount covers everything expected up to this year. Partial: it covers part of it. Not up to date: nothing has been credited yet.',
      },
      equilibrage: {
        titre: 'Rebalancing',
        texte:
          'Spreads what a member has already paid across several years, for example to settle an older year. It neither adds nor removes money: the total stays the same, only the split changes.',
      },
      anneeAdhesion: {
        titre: 'Joining year',
        texte: 'The first year for which the member owes a contribution. Earlier years are not charged.',
      },
      finContribution: {
        titre: 'Contribution end',
        texte:
          'The last year owed by the member. It is filled in automatically when the member becomes inactive or passes away, and their history is kept.',
      },
      chefSousFamille: {
        titre: 'Sub-family head',
        texte: 'The reference member of the sub-family this member belongs to. It is used to group members of the same sub-family.',
      },
      chefOrganisation: {
        titre: 'Head of the organisation',
        texte:
          "The organisation's designated leader, shown with their nickname. An administrator or the president designates them from the member's page.",
      },
      recus: {
        titre: 'Receipts',
        texte:
          'Each payment produces a numbered receipt that you can download or send to the member through the configured channels. To correct a payment, first cancel its receipt: it keeps its number and can no longer be shared. A new receipt is then issued.',
      },
      circuitDepense: {
        titre: 'Expense workflow',
        texte:
          'An expense goes from draft to pending, is then approved or rejected, and finally paid. Approval is done by the administrator, the president or the auditor. Payment is done by the administrator, the president or the treasurer.',
      },
      modeRotation: {
        titre: 'Rotation mode',
        texte:
          'Fixed order: the order of beneficiaries is set when the cycle opens. Draw: each round, a beneficiary is drawn at random among those who have not received yet. The auction mode is not available yet.',
      },
      cagnotte: {
        titre: 'Fund',
        texte:
          'A one-off collection for an event (wedding, bereavement…), with a target and donations. It is tracked separately from annual contributions.',
      },
      voteResolution: {
        titre: 'Resolution vote',
        texte:
          'A leader opens the vote, then each member votes for, against or abstains. When the vote closes, the resolution is adopted if there are more votes for than against. Abstentions are not counted.',
      },
      forfaitEcheance: {
        titre: 'Plan and expiry',
        texte:
          "The plan sets the space's capabilities (number of members, storage, online payment). At expiry, a 14-day grace period starts. After that, the space returns to the Free plan without losing its data.",
      },
    },
  },
}
