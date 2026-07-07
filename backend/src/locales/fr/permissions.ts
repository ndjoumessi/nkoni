/** Messages FR d'autorisation (middlewares/permissions.ts, §4 i18n). */
export const messages = {
  'permissions.roleSansPermission':
    "Le rôle {role} n'a pas la permission '{action}' sur l'entité '{entite}'.",
  'permissions.reserveSuperAdmin': 'Accès réservé à un administrateur de la plateforme.',
} as const
