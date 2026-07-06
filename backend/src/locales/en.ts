/**
 * Catalogue de messages EN (§4 i18n). Typé `Messages` → le compilateur exige EXACTEMENT
 * les mêmes clés que `fr.ts` (parité garantie ; une clé oubliée = erreur de build).
 */
import type { Messages } from './fr'

export const en: Messages = {
  // Communs (transverses)
  'commun.tokenInvalide': 'Invalid token.',
  'commun.tokenAbsent': 'Missing or invalid JWT token.',
  'commun.nonAutorise': 'Not authorized.',
  'commun.authRequise': 'Authentication required.',

  // Autorisation (middlewares/permissions.ts)
  'permissions.roleSansPermission':
    "Role {role} does not have permission '{action}' on entity '{entite}'.",
  'permissions.reserveSuperAdmin': 'Restricted to a platform administrator.',

  // Authentification (auth.route.ts)
  'auth.identifiantsInvalides': 'Invalid credentials.',
  'auth.compteDesactive': 'Account disabled.',
  'auth.espaceSuspendu': 'This workspace has been suspended. Please contact support.',
  'auth.refreshInvalide': 'Invalid refresh token.',
  'auth.sessionInvalide': 'Invalid session.',
  'auth.refreshAbsent': 'Missing or invalid refresh token.',
  'auth.utilisateurIntrouvable': 'User not found.',
  'auth.ancienMotDePasseIncorrect': 'Current password is incorrect.',

  // Gestion des comptes (utilisateurs.route.ts + utilisateur.service.ts)
  'utilisateurs.gestionReserveeAdmin': 'Account management is restricted to the administrator.',
  'utilisateurs.autoVerrouillage': 'You cannot disable or demote your own account.',
  'utilisateurs.emailDejaUtilise': 'An account already exists with email {email}.',
  'utilisateurs.membreIntrouvable': 'Member not found ({membreId}).',
  'utilisateurs.membreDejaLie': 'This member is already linked to an account.',
  'utilisateurs.introuvable': 'User not found.',

  // Auto-inscription (organisations.route.ts) — deliberately generic (anti-enumeration).
  'organisations.inscriptionImpossible': 'Unable to create this workspace with the provided details.',

  // Console plateforme Super-Admin (platform.route.ts)
  'platform.organisationIntrouvable': 'Organisation not found.',
}
