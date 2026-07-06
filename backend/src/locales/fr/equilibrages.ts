/** Messages FR du domaine « equilibrages » (§4 i18n). */
export const messages = {
  'equilibrages.plageInvalide':
    "Plage d'années invalide : anneeDebut ({anneeDebut}) doit être <= anneeFin ({anneeFin}).",
  'equilibrages.anneeManquante':
    "Aucune contribution pour l'année {annee} : ouvrez l'année avant d'équilibrer la plage.",
  'equilibrages.sommeInvalide':
    'La somme des montants ajustés ({sommeAjustee}) doit être égale au total de la période ({totalPeriode}).',
  'equilibrages.nombreMontantsInvalide':
    'Il faut exactement {nombreAnnees} montant(s) ajusté(s) pour la plage {anneeDebut}-{anneeFin}, {nombreFournis} fourni(s).',
} as const
