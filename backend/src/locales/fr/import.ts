/** Messages FR du domaine « import de membres » (§5.2 i18n). */
export const messages = {
  'import.erreur.nomRequis': 'Le nom est requis.',
  'import.erreur.prenomRequis': 'Le prénom est requis.',
  'import.erreur.anneeRequise': "L'année d'adhésion est requise.",
  'import.erreur.anneeInvalide': "L'année d'adhésion doit être comprise entre 1900 et 2200.",
  'import.erreur.anneeFuture': "L'année d'adhésion ne peut pas être dans le futur.",
  'import.erreur.statutInvalide': 'Statut invalide (ACTIF, INACTIF ou DECEDE).',
  'import.erreur.anneeFinInvalide':
    'L’année de fin de contribution doit être comprise entre 1900 et 2200.',
  'import.erreur.dateInvalide': 'Date invalide (format attendu AAAA-MM-JJ).',
  'import.erreur.brancheInconnue': "Branche inconnue dans l'organisation.",
  'import.quotaDepasse':
    'Import refusé : {aCreer} membre(s) à créer porterai(en)t le total au-delà de {plafond} (plan gratuit ; {actuel} actuellement).',
  'import.aucuneLigne': 'Aucune ligne à importer.',
  'import.fichierInvalide': 'Fichier illisible. Vérifiez le format (.xlsx ou .csv).',
} as const
