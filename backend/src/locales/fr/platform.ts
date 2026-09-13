/** Messages FR de la console plateforme Super-Admin (platform.route.ts, §4). */
export const messages = {
  'platform.organisationIntrouvable': 'Organisation introuvable.',
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
    "L'échéance de cette organisation vient d'être modifiée : rechargez la page puis relancez la prolongation.",
} as const
