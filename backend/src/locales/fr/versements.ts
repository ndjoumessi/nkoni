/** Messages FR du domaine « versements » (§4 i18n). */
export const messages = {
  'versements.contributionIntrouvable': 'Contribution introuvable.',
  'versements.versementIntrouvable': 'Versement introuvable.',
  // Suppression : bloquée par un reçu ACTIF seulement. L'annuler débloque — le reçu survit alors
  // en orphelin, avec son numéro et son montant figés (migration `recu_orphelin_snapshot_membre`).
  // Même conseil que pour la modification, car c'est le même geste.
  'versements.suppressionRecuEmis':
    'Le reçu {numero} est actif pour ce versement : annulez-le avant de le supprimer.',
  // Modification : bloquée par un reçu ACTIF seulement — l'annuler débloque vraiment.
  'versements.modificationRecuActif':
    'Le reçu {numero} est actif pour ce versement : annulez-le avant de le modifier.',
} as const
