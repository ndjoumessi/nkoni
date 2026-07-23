/** EN messages — online payment domain (§ paiement). Strict parity with FR. */
export const messages = {
  'paiement.chiffrementIndisponible':
    'Payment configuration unavailable: the encryption key is not set on the server.',
  'paiement.identifiantsInvalides': 'Payment provider credentials are invalid or incomplete.',
  'paiement.montantInvalide': 'Invalid amount (minimum 100 XAF).',
  'paiement.montantSuperieurReste': 'The amount exceeds the remaining balance on this contribution.',
  'paiement.nonConfigure': 'Online payment is not enabled for this organisation.',
  'paiement.contributionIntrouvable': 'Contribution not found.',
  'paiement.telephoneRequis':
    'A phone number is required for this payment method. Add your Mobile Money number, then try again.',
} as const
