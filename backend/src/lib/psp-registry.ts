import type {
  PspClient,
  CredentialsPsp,
  DemandeCollecte,
  ResultatCollecte,
  StatutPaiementResolu,
  PspProviderCode,
} from '../services/psp.service'
import { fapshiClient } from './psp-fapshi'
import { campayClient } from './psp-campay'

/**
 * Dispatcher multi-provider — implémente `PspClient` en ROUTANT chaque appel vers l'adaptateur qui
 * correspond à `creds.provider`. C'est ce que `buildApp` injecte par défaut dans `app.psp` : le cœur
 * métier (paiement.service, routes) continue de ne connaître QUE l'interface `PspClient`, sans savoir
 * quel PSP sert l'organisation courante. Le choix Fapshi/CamPay est un attribut de la CONFIG de l'org
 * (`ParametrePaiement.provider`), donc porté par les `creds` de CHAQUE appel — jamais un état global.
 *
 * Les tests continuent d'injecter un mock à la place de ce dispatcher ; en production, ajouter un
 * nouveau PSP = un adaptateur de plus dans `ADAPTATEURS`, rien d'autre à toucher.
 */

const ADAPTATEURS: Record<PspProviderCode, PspClient> = {
  FAPSHI: fapshiClient,
  CAMPAY: campayClient,
}

function adaptateur(creds: CredentialsPsp): PspClient {
  const client = ADAPTATEURS[creds.provider]
  if (!client) throw new Error(`PSP inconnu : ${creds.provider}`)
  return client
}

export const pspRegistry: PspClient = {
  initierCollecte(creds: CredentialsPsp, demande: DemandeCollecte): Promise<ResultatCollecte> {
    return adaptateur(creds).initierCollecte(creds, demande)
  },
  verifierStatut(creds: CredentialsPsp, referenceExterne: string): Promise<StatutPaiementResolu> {
    return adaptateur(creds).verifierStatut(creds, referenceExterne)
  },
  verifierSignatureWebhook(creds: CredentialsPsp, payloadBrut: string, signature: string | undefined): boolean {
    return adaptateur(creds).verifierSignatureWebhook(creds, payloadBrut, signature)
  },
}

export default pspRegistry
