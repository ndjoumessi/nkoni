/** Messages FR du domaine « paiement en ligne » (§ paiement). */
export const messages = {
  'paiement.chiffrementIndisponible':
    'Configuration de paiement indisponible : la clé de chiffrement n’est pas configurée sur le serveur.',
  'paiement.identifiantsInvalides': 'Identifiants du prestataire de paiement invalides ou incomplets.',
  'paiement.montantInvalide': 'Montant invalide (minimum 100 XAF).',
  'paiement.montantSuperieurReste': 'Le montant dépasse le reste dû sur cette contribution.',
  'paiement.nonConfigure': 'Le paiement en ligne n’est pas activé pour cette organisation.',
  'paiement.contributionIntrouvable': 'Contribution introuvable.',
} as const
