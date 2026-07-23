import type {
  PspClient,
  CredentialsPsp,
  DemandeCollecte,
  ResultatCollecte,
  StatutPaiementResolu,
} from '../services/psp.service'

/**
 * Adapter CAMPAY de `PspClient` — collecte Mobile Money (MTN + Orange) en COLLECTE DIRECTE : NKONI
 * envoie le NUMÉRO du payeur (`from`) et CamPay déclenche l'invite MoMo directement sur son téléphone
 * (pas de page hébergée, pas de redirection). L'argent atterrit sur le compte CamPay de l'ORG
 * (identifiants passés par appel — modèle « argent direct à l'org », NKONI jamais custodian).
 *
 * Auth : en-tête `Authorization: Token <token>` (token d'accès permanent de l'app CamPay de l'org).
 * Base URL selon l'environnement des identifiants (SANDBOX = demo, LIVE = prod). `external_reference`
 * = notre référence interne (réconciliation) ; CamPay renvoie SA `reference` qu'on stocke comme
 * `referenceExterne` (clé d'idempotence de la confirmation).
 *
 * La VÉRITÉ du statut vient TOUJOURS de `GET /transaction/{reference}/` (appel authentifié), jamais
 * du corps d'un webhook — même modèle infalsifiable que Fapshi. CamPay SIGNE pourtant ses webhooks
 * (champ `signature` = JWT) ; vérifier cette signature serait une défense en profondeur, mais comme
 * on re-vérifie déjà le statut de façon authentifiée (plus fort qu'un secret partagé), on accepte ici
 * le webhook comme simple DÉCLENCHEUR (cf. `verifierSignatureWebhook`). Durcissement JWT = chantier suivant.
 */

const BASE_URL: Record<string, string> = {
  SANDBOX: 'https://demo.campay.net/api',
  LIVE: 'https://www.campay.net/api',
}

function baseUrl(creds: CredentialsPsp): string {
  return BASE_URL[creds.identifiants['environnement'] ?? 'SANDBOX'] ?? BASE_URL['SANDBOX']!
}

function entetes(creds: CredentialsPsp): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Token ${creds.identifiants['token'] ?? ''}`,
  }
}

/** Mappe le statut CamPay vers notre énum. Défaut prudent : EN_ATTENTE (on ne confirme rien à tort). */
function versStatutResolu(statutCampay: unknown): StatutPaiementResolu {
  switch (String(statutCampay).toUpperCase()) {
    case 'SUCCESSFUL':
      return 'REUSSI'
    case 'FAILED':
      return 'ECHEC'
    default:
      return 'EN_ATTENTE' // PENDING / inconnu — un prochain poll/webhook tranchera
  }
}

export class CampayTelephoneRequisError extends Error {
  constructor() {
    super('CamPay (collecte directe) exige le numéro du payeur.')
    this.name = 'CampayTelephoneRequisError'
  }
}

export const campayClient: PspClient = {
  async initierCollecte(creds: CredentialsPsp, demande: DemandeCollecte): Promise<ResultatCollecte> {
    // Collecte DIRECTE : le numéro du payeur est OBLIGATOIRE (l'invite MoMo part vers ce numéro).
    if (!demande.telephone) throw new CampayTelephoneRequisError()
    const res = await fetch(`${baseUrl(creds)}/collect/`, {
      method: 'POST',
      headers: entetes(creds),
      body: JSON.stringify({
        amount: String(demande.montant), // CamPay attend le montant en chaîne
        currency: 'XAF',
        from: demande.telephone, // E.164 sans « + », ex. 2376XXXXXXXX
        description: demande.description,
        external_reference: demande.reference,
      }),
    })
    if (!res.ok) {
      throw new Error(`CamPay collect ${res.status}`)
    }
    const data = (await res.json()) as { reference?: string }
    if (!data.reference) throw new Error('CamPay collect : reference manquante')
    // Pas d'`urlPaiement` : collecte directe, le membre valide sur son téléphone puis on SONDE le statut.
    return { referenceExterne: data.reference, statut: 'EN_ATTENTE' }
  },

  async verifierStatut(creds: CredentialsPsp, referenceExterne: string): Promise<StatutPaiementResolu> {
    const res = await fetch(`${baseUrl(creds)}/transaction/${encodeURIComponent(referenceExterne)}/`, {
      headers: entetes(creds),
    })
    if (!res.ok) return 'EN_ATTENTE' // transitoire : on ne conclut ni REUSSI ni ECHEC sur une erreur réseau
    const data = (await res.json()) as { status?: string }
    return versStatutResolu(data.status)
  },

  // CamPay signe ses webhooks (JWT), mais notre confirmation ne fait AUCUNE confiance au corps : elle
  // rappelle `verifierStatut(reference)` (authentifié) — plus fort qu'un secret partagé. On accepte
  // donc le webhook comme déclencheur ; le durcissement par vérification JWT est un chantier suivant.
  verifierSignatureWebhook(): boolean {
    return true
  },
}

export default campayClient
