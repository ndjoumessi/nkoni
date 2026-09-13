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
  // Organisation name included : the same person can manage several associations, and a
  // commercial-looking reminder without an organisation name reads like phishing.
  'notifications.forfaitEcheance.titre': 'NKONI plan end date — {organisation}',
  'notifications.forfaitEcheance.J30':
    'The {forfait} plan of {organisation} ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J7':
    'The {forfait} plan of {organisation} ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J1':
    'The {forfait} plan of {organisation} ends on {date}. Renew it now to avoid any interruption.',
  'notifications.forfaitEcheance.GRACE':
    'The {forfait} plan of {organisation} expired on {date}. Its features remain active until {fin}: renew it before then.',
  'notifications.forfaitEcheance.pied':
    'To renew, write to us from the Settings page of your NKONI space.',
  'notifications.forfaits.GRATUIT': 'Free',
  'notifications.forfaits.PRO': 'Pro',
  'notifications.forfaits.ENTREPRISE': 'Enterprise',
}
