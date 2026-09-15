/** Messages FR de la console plateforme Super-Admin (platform.route.ts, §4). */
export const messages = {
  'platform.organisationIntrouvable': 'Organisation introuvable.',
  'platform.organisationDemo':
    "Espace de démonstration : il est géré par la régénération automatique, pas depuis la console.",
  // Suppression définitive (0.3) : la suspension préalable n'est pas une formalité — c'est elle
  // qui garantit qu'aucun écrivain concurrent (scheduler, session active) n'entrera en conflit.
  'platform.organisationNonSuspendue':
    "Cette organisation est encore active : suspendez-la avant de la supprimer définitivement.",
  'platform.confirmationInvalide':
    "Le nom de confirmation ne correspond pas à celui de l'organisation : suppression annulée.",
  // Fail-closed : la trace d'audit de la purge n'a pas pu être écrite → rien n'a été supprimé.
  'platform.auditIndisponible':
    "Le journal d'audit est momentanément indisponible : la suppression est annulée (aucune donnée effacée). Réessayez.",
  // Prolongation d'échéance (spec 1.1 §3.1).
  'platform.prolongationForfaitGratuit':
    "Le forfait Gratuit n'a pas d'échéance : attribuez d'abord un forfait Pro ou Entreprise.",
  'platform.prolongationConcurrente':
    "L'aperçu de la prolongation n'est plus à jour (échéance modifiée ou changement de jour) : vérifiez la nouvelle date puis confirmez à nouveau.",
  'platform.prolongationValeursAttenduesManquantes':
    "Hors aperçu, l'écriture doit indiquer les valeurs annoncées par l'aperçu (échéance actuelle et nouvelle échéance).",
} as const
