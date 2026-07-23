import type {
  PspClient,
  CredentialsPsp,
  DemandeCollecte,
  ResultatCollecte,
  StatutPaiementResolu,
} from '../services/psp.service'

/**
 * Adapter FAPSHI de `PspClient` — collecte Mobile Money (MTN + Orange) par CHECKOUT HÉBERGÉ
 * (« Initiate Pay ») : on génère un lien de paiement, le membre est redirigé chez Fapshi qui gère les
 * invites MoMo, la validation et la collecte du numéro. Aucune donnée de paiement ne transite par
 * NKONI. L'argent atterrit sur le compte Fapshi de l'ORG (identifiants passés par appel).
 *
 * Auth : en-têtes `apiuser` + `apikey` (par organisation). Base URL selon l'environnement des
 * identifiants (SANDBOX vs LIVE). `externalId` = notre référence interne (id du Paiement) →
 * réconciliation. La VÉRITÉ du statut vient TOUJOURS de `GET /payment-status/{transId}` (appel
 * authentifié), jamais du corps d'un webhook : c'est ce qui rend une confirmation infalsifiable.
 */

const BASE_URL: Record<string, string> = {
  SANDBOX: 'https://sandbox.fapshi.com',
  LIVE: 'https://live.fapshi.com',
}

function baseUrl(creds: CredentialsPsp): string {
  return BASE_URL[creds.identifiants['environnement'] ?? 'SANDBOX'] ?? BASE_URL['SANDBOX']!
}

function entetes(creds: CredentialsPsp): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apiuser: creds.identifiants['apiUser'] ?? '',
    apikey: creds.identifiants['apiKey'] ?? '',
  }
}

/** Mappe le statut Fapshi vers notre énum. Défaut prudent : EN_ATTENTE (on ne confirme rien à tort). */
function versStatutResolu(statutFapshi: unknown): StatutPaiementResolu {
  switch (String(statutFapshi).toUpperCase()) {
    case 'SUCCESSFUL':
      return 'REUSSI'
    case 'FAILED':
      return 'ECHEC'
    case 'EXPIRED':
      return 'EXPIRE'
    default:
      return 'EN_ATTENTE' // CREATED / PENDING / inconnu
  }
}

export const fapshiClient: PspClient = {
  async initierCollecte(creds: CredentialsPsp, demande: DemandeCollecte): Promise<ResultatCollecte> {
    const res = await fetch(`${baseUrl(creds)}/initiate-pay`, {
      method: 'POST',
      headers: entetes(creds),
      body: JSON.stringify({
        amount: demande.montant,
        externalId: demande.reference,
        message: demande.description,
        ...(demande.redirectUrl ? { redirectUrl: demande.redirectUrl } : {}),
      }),
    })
    if (!res.ok) {
      throw new Error(`Fapshi initiate-pay ${res.status}`)
    }
    const data = (await res.json()) as { transId?: string; link?: string }
    if (!data.transId) throw new Error('Fapshi initiate-pay : transId manquant')
    return {
      referenceExterne: data.transId,
      statut: 'EN_ATTENTE',
      ...(data.link ? { urlPaiement: data.link } : {}),
    }
  },

  async verifierStatut(creds: CredentialsPsp, referenceExterne: string): Promise<StatutPaiementResolu> {
    const res = await fetch(`${baseUrl(creds)}/payment-status/${encodeURIComponent(referenceExterne)}`, {
      headers: entetes(creds),
    })
    if (!res.ok) return 'EN_ATTENTE' // transitoire : on ne conclut ni REUSSI ni ECHEC sur une erreur réseau
    const data = (await res.json()) as { status?: string }
    return versStatutResolu(data.status)
  },

  // Fapshi ne signe pas ses webhooks : on n'accorde AUCUNE confiance au corps reçu. Le webhook n'est
  // qu'un DÉCLENCHEUR — la route de webhook rappellera `verifierStatut(transId)` (appel authentifié)
  // pour établir la vérité. On accepte donc la réception ici ; la sécurité est dans la re-vérification.
  verifierSignatureWebhook(): boolean {
    return true
  },
}

export default fapshiClient
