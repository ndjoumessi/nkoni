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
 * AUTH — deux modes, dans cet ordre :
 *  1. `username` + `password` de l'app CamPay → POST `/token/` pour obtenir un token TEMPORAIRE
 *     (~1 h), puis `Authorization: Token <token>`. C'est le flux PRINCIPAL de CamPay (celui qu'on a
 *     vu marcher en prod ailleurs). On ré-obtient un token à CHAQUE opération : nos volumes sont
 *     faibles, et rester sans état évite un cache partagé fragile entre instances Railway.
 *  2. `token` (jeton d'accès PERMANENT du dashboard) → utilisé DIRECTEMENT, sans passer par `/token/`.
 *     Repli si l'org n'a pas fourni username/password.
 *
 * Base URL selon l'environnement (SANDBOX = demo, LIVE = prod). `external_reference` = notre référence
 * interne (réconciliation) ; CamPay renvoie SA `reference` qu'on stocke comme `referenceExterne` (clé
 * d'idempotence). La VÉRITÉ du statut vient TOUJOURS de `GET /transaction/{reference}/` (authentifié),
 * jamais du corps d'un webhook — même modèle infalsifiable que Fapshi. CamPay SIGNE ses webhooks (JWT)
 * mais on ne s'y fie pas (re-vérification authentifiée plus forte) ; durcissement JWT = chantier suivant.
 */

const BASE_URL: Record<string, string> = {
  SANDBOX: 'https://demo.campay.net/api',
  LIVE: 'https://www.campay.net/api',
}

function baseUrl(creds: CredentialsPsp): string {
  return BASE_URL[creds.identifiants['environnement'] ?? 'SANDBOX'] ?? BASE_URL['SANDBOX']!
}

export class CampayTelephoneRequisError extends Error {
  constructor() {
    super('CamPay (collecte directe) exige le numéro du payeur.')
    this.name = 'CampayTelephoneRequisError'
  }
}
export class CampayIdentifiantsRequisError extends Error {
  constructor() {
    super('CamPay : fournir un jeton permanent OU un couple username + password.')
    this.name = 'CampayIdentifiantsRequisError'
  }
}

/** Corps de réponse tronqué — pour que les erreurs remontent le POURQUOI de CamPay, pas juste un code. */
async function corpsErreur(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Résout un access token pour l'org : jeton permanent direct si fourni, sinon échange username/password
 * contre un token temporaire via `/token/`. Lève avec le corps de réponse en cas d'échec d'échange.
 */
async function obtenirAccessToken(creds: CredentialsPsp): Promise<string> {
  const direct = creds.identifiants['token']?.trim()
  if (direct) return direct
  const username = creds.identifiants['username']?.trim()
  const password = creds.identifiants['password']?.trim()
  if (!username || !password) throw new CampayIdentifiantsRequisError()
  const res = await fetch(`${baseUrl(creds)}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`CamPay token ${res.status} — ${await corpsErreur(res)}`)
  const data = (await res.json()) as { token?: string }
  if (!data.token) throw new Error('CamPay token : réponse sans token')
  return data.token
}

async function entetes(creds: CredentialsPsp): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Token ${await obtenirAccessToken(creds)}`,
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

export const campayClient: PspClient = {
  async initierCollecte(creds: CredentialsPsp, demande: DemandeCollecte): Promise<ResultatCollecte> {
    // Collecte DIRECTE : le numéro du payeur est OBLIGATOIRE (l'invite MoMo part vers ce numéro).
    if (!demande.telephone) throw new CampayTelephoneRequisError()
    const res = await fetch(`${baseUrl(creds)}/collect/`, {
      method: 'POST',
      headers: await entetes(creds),
      body: JSON.stringify({
        amount: String(demande.montant), // CamPay attend le montant en chaîne
        currency: 'XAF',
        from: demande.telephone, // E.164 sans « + », ex. 2376XXXXXXXX
        description: demande.description,
        external_reference: demande.reference,
      }),
    })
    if (!res.ok) {
      throw new Error(`CamPay collect ${res.status} — ${await corpsErreur(res)}`)
    }
    const data = (await res.json()) as { reference?: string }
    if (!data.reference) throw new Error('CamPay collect : reference manquante')
    // Pas d'`urlPaiement` : collecte directe, le membre valide sur son téléphone puis on SONDE le statut.
    return { referenceExterne: data.reference, statut: 'EN_ATTENTE' }
  },

  async verifierStatut(creds: CredentialsPsp, referenceExterne: string): Promise<StatutPaiementResolu> {
    // Tout échec (auth, réseau, non-OK) est TRANSITOIRE ici : on ne conclut ni REUSSI ni ECHEC sur une
    // erreur — un prochain poll/webhook tranchera. On ne casse donc jamais la confirmation.
    try {
      const res = await fetch(`${baseUrl(creds)}/transaction/${encodeURIComponent(referenceExterne)}/`, {
        headers: await entetes(creds),
      })
      if (!res.ok) return 'EN_ATTENTE'
      const data = (await res.json()) as { status?: string }
      return versStatutResolu(data.status)
    } catch {
      return 'EN_ATTENTE'
    }
  },

  // CamPay signe ses webhooks (JWT), mais notre confirmation ne fait AUCUNE confiance au corps : elle
  // rappelle `verifierStatut(reference)` (authentifié) — plus fort qu'un secret partagé. On accepte
  // donc le webhook comme déclencheur ; le durcissement par vérification JWT est un chantier suivant.
  verifierSignatureWebhook(): boolean {
    return true
  },
}

export default campayClient
