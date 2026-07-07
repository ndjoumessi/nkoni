/** Messages FR de gestion des comptes (utilisateurs.route.ts + utilisateur.service.ts, §4). */
export const messages = {
  'utilisateurs.gestionReserveeAdmin': "La gestion des comptes est réservée à l'administrateur.",
  'utilisateurs.autoVerrouillage':
    'Vous ne pouvez pas désactiver ni rétrograder votre propre compte.',
  'utilisateurs.emailDejaUtilise': "Un compte existe déjà avec l'email {email}.",
  'utilisateurs.membreIntrouvable': 'Membre introuvable ({membreId}).',
  'utilisateurs.membreDejaLie': 'Ce membre est déjà lié à un compte.',
  'utilisateurs.introuvable': 'Utilisateur introuvable.',
} as const
