/** Messages EN des notifications in-app (§4/§5). Rendues dans la langue du DESTINATAIRE. */
export const messages = {
  'notifications.versementRecu.titre': 'Payment recorded',
  'notifications.versementRecu.message':
    'Your payment of {montant} for year {annee} has been recorded.',
  'notifications.cotisationRetard.titre': 'Contribution overdue',
  'notifications.cotisationRetard.message': 'Your contribution is not up to date.',
  'notifications.reunionRappel.titre': 'Upcoming meeting',
  'notifications.reunionRappel.message': 'Meeting on {date} at {lieu}.',
  // Plan end date (spec 1.1 §4.1) — recipients ADMIN/PRESIDENT, service notice.
  'notifications.forfaitEcheance.titre': 'Your NKONI plan end date',
  'notifications.forfaitEcheance.J30':
    'Your {forfait} plan ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J7':
    'Your {forfait} plan ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J1':
    'Your {forfait} plan ends on {date}. Renew it now to avoid any interruption.',
  'notifications.forfaitEcheance.GRACE':
    'Your {forfait} plan expired on {date}. Its features remain active until {fin}: renew it before then.',
  'notifications.forfaitEcheance.pied':
    'To renew, write to us from the Settings page of your NKONI space.',
  'notifications.forfaits.GRATUIT': 'Free',
  'notifications.forfaits.PRO': 'Pro',
  'notifications.forfaits.ENTREPRISE': 'Enterprise',
}
