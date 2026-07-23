/**
 * Abstraction du prestataire de paiement (PSP) — § paiement en ligne. Même esprit que `BlobClient`,
 * `WhatsAppClient`, `EmailClient` : une interface MOCKABLE injectée dans `buildApp`, une implémentation
 * réelle branchée en production (adapter Fapshi, Phase 2). Le cœur métier (routes/services) ne connaît
 * QUE cette interface — le choix du PSP reste un détail d'implémentation.
 *
 * Modèle « argent direct à chaque organisation » : chaque appel porte les identifiants de l'ORG
 * concernée (déchiffrés à la volée depuis `ParametrePaiement`). NKONI n'a pas de compte marchand
 * central et ne détient jamais les fonds — il orchestre la collecte sur le compte de l'asso.
 */

export type PspProviderCode = 'FAPSHI' | 'CAMPAY'
export type EnvironnementPsp = 'SANDBOX' | 'LIVE'

/** Identifiants d'un service Fapshi (par organisation) : apiUser + apiKey + environnement. */
export interface IdentifiantsFapshi {
  apiUser: string
  apiKey: string
  environnement: EnvironnementPsp
}

/** Identifiants d'une app CamPay (par organisation) : token d'accès permanent + environnement. */
export interface IdentifiantsCampay {
  token: string
  environnement: EnvironnementPsp
}

/** Identifiants déchiffrés + provider, tels que passés au client PSP. */
export interface CredentialsPsp {
  provider: PspProviderCode
  identifiants: Record<string, string>
}

/** Demande de collecte (débit du payeur vers le compte de l'org). */
export interface DemandeCollecte {
  montant: number
  /** Référence interne NKONI (id du Paiement) — corrèle webhook ↔ transaction, idempotence. */
  reference: string
  description: string
  /** URL de retour après paiement (checkout hébergé). Optionnel. */
  redirectUrl?: string
  /** Téléphone du payeur — utilisé par les PSP « direct pay » ; ignoré par le checkout hébergé. */
  telephone?: string
}

export interface ResultatCollecte {
  /** Id de transaction attribué par le PSP — clé d'idempotence de la confirmation. */
  referenceExterne: string
  /** URL de la page de paiement hébergée (checkout par redirection) — absente en « direct pay ». */
  urlPaiement?: string
  statut: 'EN_ATTENTE' | 'ECHEC'
}

export type StatutPaiementResolu = 'REUSSI' | 'ECHEC' | 'EN_ATTENTE' | 'EXPIRE'

/** Interface commune à tous les PSP. Implémentation réelle (Fapshi) en Phase 2. */
export interface PspClient {
  initierCollecte(creds: CredentialsPsp, demande: DemandeCollecte): Promise<ResultatCollecte>
  verifierStatut(creds: CredentialsPsp, referenceExterne: string): Promise<StatutPaiementResolu>
  /** Vérifie l'authenticité d'un webhook PSP (signature/secret) AVANT de traiter le corps. */
  verifierSignatureWebhook(creds: CredentialsPsp, payloadBrut: string, signature: string | undefined): boolean
}

/** Champs requis par provider — utilisé par la config pour valider la saisie avant chiffrement. */
export function validerIdentifiants(provider: PspProviderCode, identifiants: Record<string, unknown>): string | null {
  const nonVide = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  if (provider === 'FAPSHI') {
    if (!nonVide(identifiants['apiUser']) || !nonVide(identifiants['apiKey'])) return 'IDENTIFIANTS_INCOMPLETS'
    const env = identifiants['environnement']
    if (env !== 'SANDBOX' && env !== 'LIVE') return 'ENVIRONNEMENT_INVALIDE'
    return null
  }
  if (provider === 'CAMPAY') {
    if (!nonVide(identifiants['token'])) return 'IDENTIFIANTS_INCOMPLETS'
    const env = identifiants['environnement']
    if (env !== 'SANDBOX' && env !== 'LIVE') return 'ENVIRONNEMENT_INVALIDE'
    return null
  }
  return 'PROVIDER_INCONNU'
}

/**
 * Client PSP MOCK (Phase 1 / tests) : inerte, ne contacte aucun réseau. `initierCollecte` renvoie une
 * référence factice EN_ATTENTE ; le statut reste EN_ATTENTE ; la signature webhook est refusée par
 * défaut. Le vrai adapter Fapshi (Phase 2) remplacera ce défaut dans `buildApp`.
 */
export const pspMock: PspClient = {
  async initierCollecte(_creds, demande) {
    return { referenceExterne: `mock-${demande.reference}`, statut: 'EN_ATTENTE' }
  },
  async verifierStatut() {
    return 'EN_ATTENTE'
  },
  verifierSignatureWebhook() {
    return false
  },
}
