/** Messages FR du domaine « versements » (§4 i18n). */
export const messages = {
  'versements.contributionIntrouvable': 'Contribution introuvable.',
  'versements.versementIntrouvable': 'Versement introuvable.',
  // Suppression : bloquée par TOUT reçu, annulé compris — annuler ne débloque PAS (la FK
  // `onDelete: Restrict` l'ignore, et le reçu annulé référence ce versement). On oriente donc
  // vers la correction, seule issue réelle, plutôt que vers une annulation sans effet.
  'versements.suppressionRecuEmis':
    'Le reçu {numero} a été émis pour ce versement : il ne peut plus être supprimé. Corrigez plutôt son montant.',
  // Modification : bloquée par un reçu ACTIF seulement — l'annuler débloque vraiment.
  'versements.modificationRecuActif':
    'Le reçu {numero} est actif pour ce versement : annulez-le avant de le modifier.',
} as const
