/** Messages EN de la console plateforme Super-Admin (platform.route.ts, §4). */
export const messages = {
  'platform.organisationIntrouvable': 'Organisation not found.',
  'platform.organisationNonSuspendue':
    'This organisation is still active: suspend it before deleting it permanently.',
  'platform.confirmationInvalide':
    "The confirmation name does not match the organisation's name: deletion cancelled.",
  'platform.auditIndisponible':
    'The audit log is temporarily unavailable: deletion cancelled (no data erased). Please retry.',
  'platform.prolongationForfaitGratuit': 'The Free plan has no end date: assign a Pro or Enterprise plan first.',
  'platform.prolongationConcurrente':
    "This organisation's end date has just changed: reload the page and extend it again.",
  'platform.prolongationValeursAttenduesManquantes':
    'Outside preview, the write must carry the values shown by the preview (current end date and new end date).',
}
