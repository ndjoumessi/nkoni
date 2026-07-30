/** Messages FR transverses (§4 i18n). */
export const messages = {
  'commun.tokenInvalide': 'Token invalide.',
  'commun.tokenAbsent': 'Token JWT absent ou invalide.',
  'commun.nonAutorise': 'Non autorisé.',
  'commun.authRequise': 'Authentification requise.',
  'commun.erreurServeur': "Une erreur inattendue s'est produite. Réessayez plus tard.",
  // Libellés des modes de versement (§4.6/§4.8) — SOURCE UNIQUE des chaînes serveur, lues via
  // `libelleModeVersement()`. Auparavant recopiés à la main dans recu-pdf.service.ts ET
  // releve.service.ts (documents remis aux membres → un mode sans libellé rendait `undefined`).
  'commun.modeVersement.ESPECES': 'Espèces',
  'commun.modeVersement.TIERS': 'Tiers',
  'commun.modeVersement.MOBILE_MONEY': 'Mobile Money',
  'commun.modeVersement.AUTRE': 'Autre',
} as const
