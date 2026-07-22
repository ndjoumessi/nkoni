/** Messages EN du domaine « recus » (§4 i18n). */
export const messages = {
  'recus.versementIntrouvable': 'Payment not found.',
  'recus.actifExistant': 'An active receipt ({numero}) already exists for this payment: cancel it before issuing a new one.',
  'recus.dejaAnnule': 'This receipt is already cancelled.',
  'recus.annuleNonTelechargeable':
    'This receipt has been cancelled: it can no longer be downloaded or shared. Generate a new receipt.',
  'recus.introuvable': 'Receipt not found.',
  'recus.whatsapp.legende': 'Your NKONI receipt no. {numero}.',
  'recus.email.sujet': 'Your NKONI receipt no. {numero}',
  'recus.email.corps':
    'Hello,\n\nPlease find attached your NKONI receipt no. {numero}.\n\nThis message was sent automatically, please do not reply.',
  'recus.accesVersementsLimite': 'Access limited to your own payments.',
  'recus.versementIntrouvableGeneration':
    'Payment {versementId} not found: cannot generate a receipt.',
}
