/**
 * Messages FR des notifications in-app (§4/§5). Rendues dans la langue du DESTINATAIRE
 * (pas de l'acteur qui déclenche l'action). Voir notification.service.ts / notification-scheduler.ts.
 */
export const messages = {
  'notifications.versementRecu.titre': 'Versement enregistré',
  'notifications.versementRecu.message':
    "Votre versement de {montant} pour l'année {annee} a été enregistré.",
  'notifications.cotisationRetard.titre': 'Cotisation en retard',
  'notifications.cotisationRetard.message': "Votre cotisation n'est pas à jour.",
  'notifications.reunionRappel.titre': 'Réunion à venir',
  'notifications.reunionRappel.message': 'Réunion le {date} à {lieu}.',
  // Échéance du forfait (spec 1.1 §4.1) — destinataires ADMIN/PRESIDENT, avis de service.
  // Nom de l'organisation inclus : un même responsable peut gérer plusieurs associations,
  // et un rappel commercial sans nom d'organisation ressemble à de l'hameçonnage.
  'notifications.forfaitEcheance.titre': 'Échéance du forfait NKONI — {organisation}',
  'notifications.forfaitEcheance.J30':
    'Le forfait {forfait} de {organisation} arrive à échéance le {date}, dans {jours} jours. Contactez-nous pour le renouveler sans interruption.',
  'notifications.forfaitEcheance.J7':
    'Le forfait {forfait} de {organisation} arrive à échéance le {date}, dans {jours} jours. Contactez-nous pour le renouveler sans interruption.',
  'notifications.forfaitEcheance.J1':
    'Le forfait {forfait} de {organisation} arrive à échéance le {date}. Renouvelez-le dès maintenant pour éviter toute interruption.',
  'notifications.forfaitEcheance.GRACE':
    "Le forfait {forfait} de {organisation} a expiré le {date}. Ses fonctionnalités restent actives jusqu'au {fin} : renouvelez-le d'ici là.",
  'notifications.forfaitEcheance.pied':
    'Pour renouveler, écrivez-nous depuis la page Paramètres de votre espace NKONI.',
  'notifications.forfaits.GRATUIT': 'Gratuit',
  'notifications.forfaits.PRO': 'Pro',
  'notifications.forfaits.ENTREPRISE': 'Entreprise',
} as const
