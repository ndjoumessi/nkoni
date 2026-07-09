/** Messages EN du domaine « import de membres » (§5.2 i18n) — parité stricte avec FR. */
export const messages = {
  'import.erreur.nomRequis': 'Last name is required.',
  'import.erreur.prenomRequis': 'First name is required.',
  'import.erreur.anneeRequise': 'Membership year is required.',
  'import.erreur.anneeInvalide': 'Membership year must be between 1900 and 2200.',
  'import.erreur.anneeFuture': 'Membership year cannot be in the future.',
  'import.erreur.statutInvalide': 'Invalid status (ACTIF, INACTIF or DECEDE).',
  'import.erreur.anneeFinInvalide': 'Contribution end year must be between 1900 and 2200.',
  'import.erreur.dateInvalide': 'Invalid date (expected format YYYY-MM-DD).',
  'import.erreur.brancheInconnue': 'Unknown branch in the organisation.',
  'import.quotaDepasse':
    'Import refused: creating {aCreer} member(s) would push the total beyond {plafond} (free plan; {actuel} currently).',
  'import.aucuneLigne': 'No rows to import.',
} as const
