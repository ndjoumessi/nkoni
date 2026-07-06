/**
 * Catalogue de messages FR (§4 i18n) — langue de référence.
 *
 * Convention de clés : `<domaine>.<message>` (ex. `auth.identifiantsInvalides`). Les valeurs
 * peuvent contenir des jetons d'interpolation `{nom}` résolus par `t()` (voir lib/i18n.ts).
 *
 * FR est la source de vérité : `CleMessage` est dérivé de ses clés, et `en.ts` DOIT implémenter
 * exactement le même ensemble (type `Messages`) → parité garantie à la compilation.
 *
 * Ce catalogue s'enrichit lot par lot (B1 auth/utilisateurs/organisations/platform, B2 membres…).
 */
export const fr = {
  // Communs (transverses)
  'commun.tokenInvalide': 'Token invalide.',
  'commun.tokenAbsent': 'Token JWT absent ou invalide.',
  'commun.nonAutorise': 'Non autorisé.',
  'commun.authRequise': 'Authentification requise.',

  // Autorisation (middlewares/permissions.ts)
  'permissions.roleSansPermission':
    "Le rôle {role} n'a pas la permission '{action}' sur l'entité '{entite}'.",
  'permissions.reserveSuperAdmin': 'Accès réservé à un administrateur de la plateforme.',

  // Authentification (auth.route.ts)
  'auth.identifiantsInvalides': 'Identifiants invalides.',
  'auth.compteDesactive': 'Compte désactivé.',
  'auth.espaceSuspendu': 'Cet espace a été suspendu. Contactez le support.',
  'auth.refreshInvalide': 'Refresh token invalide.',
  'auth.sessionInvalide': 'Session invalide.',
  'auth.refreshAbsent': 'Refresh token absent ou invalide.',
  'auth.utilisateurIntrouvable': 'Utilisateur introuvable.',
  'auth.ancienMotDePasseIncorrect': 'Ancien mot de passe incorrect.',

  // Gestion des comptes (utilisateurs.route.ts + utilisateur.service.ts)
  'utilisateurs.gestionReserveeAdmin': "La gestion des comptes est réservée à l'administrateur.",
  'utilisateurs.autoVerrouillage':
    'Vous ne pouvez pas désactiver ni rétrograder votre propre compte.',
  'utilisateurs.emailDejaUtilise': "Un compte existe déjà avec l'email {email}.",
  'utilisateurs.membreIntrouvable': 'Membre introuvable ({membreId}).',
  'utilisateurs.membreDejaLie': 'Ce membre est déjà lié à un compte.',
  'utilisateurs.introuvable': 'Utilisateur introuvable.',

  // Auto-inscription (organisations.route.ts) — message anti-énumération volontairement générique.
  'organisations.inscriptionImpossible': 'Impossible de créer cet espace avec ces informations.',

  // Console plateforme Super-Admin (platform.route.ts)
  'platform.organisationIntrouvable': 'Organisation introuvable.',
} as const

/** Clé de message valide (union dérivée du catalogue FR). */
export type CleMessage = keyof typeof fr

/** Forme qu'un catalogue de langue doit respecter (mêmes clés que FR). */
export type Messages = Record<CleMessage, string>
