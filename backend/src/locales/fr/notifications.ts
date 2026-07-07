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
} as const
