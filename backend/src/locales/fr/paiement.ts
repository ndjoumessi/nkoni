/** Messages FR du domaine « paiement en ligne » (§ paiement). */
export const messages = {
  'paiement.chiffrementIndisponible':
    'Configuration de paiement indisponible : la clé de chiffrement n’est pas configurée sur le serveur.',
  'paiement.identifiantsInvalides': 'Identifiants du prestataire de paiement invalides ou incomplets.',
  'paiement.montantInvalide': 'Montant de paiement invalide (inférieur au minimum autorisé).',
  'paiement.montantSuperieurReste': 'Le montant dépasse le reste dû sur cette contribution.',
  'paiement.nonConfigure': 'Le paiement en ligne n’est pas activé pour cette organisation.',
  'paiement.contributionIntrouvable': 'Contribution introuvable.',
  'paiement.telephoneRequis':
    'Numéro de téléphone requis pour ce mode de paiement. Renseignez votre numéro Mobile Money puis réessayez.',
} as const
